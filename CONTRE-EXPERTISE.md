# POINT DE RUPTURE — contre-expertise et cahier des charges révisé

Version 5 du 11 novembre 2026 : corrigée après deux relectures adverses, puis alignée sur vos décisions du même jour (tout se fait dans Unreal Engine ; modèles tirés des contenus gratuits d'Unreal ou générés par Claude ; ni achat ni sous-traitance). Avancement mis à jour le 12 novembre 2026 (section 9). Rien du jeu n'est implémenté et aucun équilibre n'est démontré ; seul existe le socle technique de l'étape A1 : un noyau de simulation déterministe qui ne connaît encore aucune règle du jeu, ses relectures et ses tests. Tous les nombres de conception sont des hypothèses de prototype ; ★ marque ceux à essayer en premier.

**Comment ce document a été établi.** Quatre contre-expertises indépendantes du document d'origine (règles, factions, technique, expérience du joueur), trois conceptions libres commandées avant de l'avoir lu, et deux enquêtes sur les documentations officielles, chacune relue par un second lecteur chargé de la réfuter. J'ai arbitré, rédigé, puis fait attaquer ce texte deux fois : trois relecteurs sur la première version (36 constats), deux sur la version corrigée (20 constats, dont un bloquant). Tous sont intégrés ; la présente version n'a pas été relue une troisième fois. Tous les rapports sont dans `annexes/`. Les faits techniques de la section 8 renvoient à la liste de sources en fin de document. Les précédents de jeux cités sans renvoi le sont de mémoire.

---

## 1. Verdict

**Ce qui mérite d'être développé**

- Le combat non létal à l'échelle de l'escouade, avec repli volontaire et reconstitution payante. C'est la meilleure idée du document et la seule qui tire quelque chose du thème : en ville, on disperse, on ne détruit pas.
- Les garde-fous de la section 5 d'origine : effets annoncés, contrôles courts, aucune ressource à l'élimination, pas de héros, passants décoratifs. Ils coupent les causes habituelles d'emballement.
- Les objectifs séparés de l'économie, qui obligent l'armée à sortir.
- Les trois styles promis (réseau, front, secteur), à condition d'en faire trois règles différentes.
- Les réflexes techniques : simulation séparée, ordres communs au joueur et à l'IA, navigation testée tôt, refus du réseau ajouté à la fin.

**Ce qui peut faire échouer le projet**

1. **Deux jeux superposés.** Le document additionne la macro-économie de StarCraft et un combat d'escouades à points de victoire, repli et renfort, qui est la structure de Dawn of War et de Company of Heroes. À douze escouades, seul le second existe.
2. **Une asymétrie de façade.** Les trois rosters sont la même grille de rôles, deux des trois mécaniques de faction sont la même zone de soutien posée, et rien ne distingue les camps avant la cinquième minute.
3. **Un thème qui n'apporte que son risque.** Aucune règle ne changerait si l'on remplaçait les manifestants par des orcs, et le ton n'est pas choisi.
4. **Un périmètre hors de portée.** 24 unités animées, 3 paliers, 5 véhicules, une IA à tenir sur 6 affrontements : la V1 telle qu'écrite ne se finit pas en petite équipe.
5. **Trois décisions techniques absentes.** L'entité simulée, le déterminisme et la navigation ne sont pas décidés, alors qu'ils conditionnent tout le reste. Unreal, que vous conservez, demande en plus quelques précautions connues (section 8.2).

**Position.** Le projet vaut d'être tenté sous la forme réduite décrite ici, et seulement après un prototype 2D de combat de rue doté d'un critère d'arrêt (section 10). Si pousser une ligne dans une rue et la faire rompre par le flanc n'est pas amusant avec des formes grises, ni l'économie ni la 3D ne le rattraperont.

---

## 2. Critique : les dix problèmes

### 2.1 Deux jeux en un, et une économie trop grande pour l'armée

**Constat.** Douze escouades de 4 à 6 personnages, c'est l'échelle de Company of Heroes. L'économie décrite (équipes, dépôts, expansions, capacité construite, trois paliers) est dimensionnée pour bien plus d'unités. Même avec les rendements réduits que je propose en 4.3, le plafond d'armée reste atteignable entre 5:10 et 5:25.
**Effet.** La moitié de la boucle « développer son économie » meurt avant la mi-partie ; les ressources s'accumulent sans emploi.
**Correction.** Assumer un **RTS d'escouades positionnel à base lisible**. Garder de StarCraft ce qui survit à cette échelle : l'ordre de construction, l'expansion risquée, le raid économique, la reconnaissance qui change la composition, et l'asymétrie sensible dès la première minute. Abandonner les navettes de récolte, les bâtiments de capacité et la course à la saturation (section 4.3).

### 2.2 Un seul roster décliné trois fois

**Constat.** Sept rôles sur neuf sont tenus à l'identique dans les trois camps : base, reconnaissance, anti-protégé, zone, soin, porteur de la mécanique, véhicule de soutien. Trois unités sur huit par faction ne combattent pas.
**Effet.** Les six affrontements se jouent comme un miroir à habillage variable ; apprendre une faction, c'est les connaître toutes.
**Correction.** Rosters à trous assumés (section 5). La Convergence n'a ni ligne protégée ni portée ; le Bastion n'a ni soin ni assaut mobile ; la Préfecture n'a ni nombre ni endurance. Les différences qui changent la manière de jouer sont le lieu d'apparition des renforts, le nombre de têtes par escouade, et qui possède les véhicules.

### 2.3 Trois mécaniques qui n'en font qu'une, absentes des premières minutes

**Constat.** Un relais est une zone de soutien posée par une structure. Un secteur est une zone de soutien posée par un véhicule, lequel choisit entre bouger et agir, ce qui est déjà une posture. Les trois sont portées par des unités de palier 2 ou 3.
**Effet.** Pendant quatre à cinq minutes, les trois camps envoient un généraliste et un éclaireur depuis une économie identique. Les factions ne se distinguent ni à l'essai ni en vidéo.
**Correction.** Trois axes différents, actifs au palier 1 : le relais décide **où** mes unités apparaissent, la posture **comment** mon unité se tient, le secteur **quand** mes capacités sont disponibles. Chaque camp reçoit son premier soutien avancé au départ et fait un geste propre dans la première minute : relais posé dès 0:00, PC mobile envoyé dès 0:00, cantonnement lancé dès 0:00 et ancrage à l'arrivée sur l'objectif vers 0:45 (section 5).

### 2.4 Le Bastion et la Préfecture ont le même profil

**Constat.** « Couverture de carte moins facile, changements de plan coûteux, exposition pendant les transitions » d'un côté ; « difficulté à couvrir plusieurs quartiers, dispositifs prévisibles, fenêtres de vulnérabilité » de l'autre.
**Effet.** Deux camps lents sur trois dans un mode qui exige de tenir plus d'objectifs que l'autre. Bastion contre Préfecture devient : chacun son objectif, le troisième disputé, score gelé.
**Correction.** Le Bastion garde la tenue frontale et l'endurance : lent, mais il ne s'épuise pas et il avance. La Préfecture devient rafale et rotation : peu d'agents, rapide sur chaussée, dominante une quarantaine de secondes, puis à vide.

### 2.5 La cohésion est une seconde barre de vie qui retire le contrôle

**Constat.** Si les mêmes attaques vident les deux jauges, la cohésion est seulement celle qui tombe en premier, avec une fuite subie en prime. Une escouade vaut 8 % de l'armée : la perdre de vue six secondes est déjà coûteux.
**Effet.** Une règle de plus à lire, aucune décision de plus.
**Correction.** Deux échelles de temps au lieu de deux barres. La cohésion décide qui tient la rue maintenant et revient seule dès qu'on cède. L'effectif visible, qui remplace l'intégrité, ne s'entame qu'à la rupture. L'escouade rompue reste commandable (règle R1). Le titre du jeu devient sa mécanique centrale.

### 2.6 Le thème n'apporte aucune règle

**Constat.** Deux ressources, des ouvriers, des paliers, un moral : tout existe à l'identique dans un RTS militaire. Le thème se réduit au véhicule à eau et aux barricades.
**Effet.** Aucune raison de préférer ce jeu à un RTS établi.
**Correction.** Trois règles que seule la rue permet : on fait rompre au lieu de détruire (R1) ; la largeur de la rue limite qui peut se battre (R2) ; les lieux s'occupent et s'évacuent, ils ne se rasent pas (R4).

### 2.7 Le barème de victoire contredit la durée visée

**Constat.** Calculé sur vos chiffres : fin à 6:10 avec trois objectifs tenus dès 2:00, à 10:20 avec deux, à 18:39 au plus tard si la majorité alterne sans jamais geler. La cible de 15 à 25 minutes n'est atteinte que par l'enlisement. Et la règle « contesté ne compte pas » rend l'enlisement rentable : un éclaireur à bas prix posé dans une zone annule un point par seconde.
**Effet.** Parties expédiées ou interminables ; défilé d'unités sacrifiées ; neutralisation du QG non chiffrée, donc soit raccourci abusif, soit décor.
**Correction.** Propriété persistante des objectifs, score par écart avec un taux qui monte en trois phases, mort subite, QG pris par occupation (section 4.2).

### 2.8 Le ton n'est pas choisi et les noms sont abstraits ou chargés

**Constat.** « Sans discours partisan » est une intention, pas une direction. Le vocabulaire a déjà pris parti : entraide et secouristes à gauche, garde et étendard à droite, contrôle pour la police. « Autonomes » désigne une mouvance réelle, « Voltigeurs » est un terme policier français chargé, ici attribué à la droite. « Collectif de pression » et « Groupe de pression » se confondent et ne décrivent aucun geste.
**Effet.** Illisible en partie, plat en boutique, exposé aux reproches des deux bords, et contraire à votre propre exigence d'organisations originales. Le miroir Préfecture contre Préfecture est absurde en registre réaliste.
**Correction.** Un registre unique, la bagarre burlesque stylisée où personne ne meurt, et une règle de nommage : un nom, un objet porté, un geste visible (sections 4.6 et 5).

### 2.9 Trop à apprendre d'un coup, et deux premières minutes plates

**Constat.** Environ 22 règles et 24 fiches d'unité à connaître avant la première partie amusante. De 0:00 à 2:00, les trois camps affectent des équipes à des dépôts, score fermé.
**Effet.** Première partie perdue sans comprendre ; abandon avant la troisième.
**Correction.** Je ne prétends pas réduire le nombre d'articles : ce cahier des charges en compte une trentaine. Ce qui baisse, c'est ce qu'il faut savoir pour jouer : six notions pour la première partie, un apprentissage en couches, un départ avec des escouades et un geste de faction immédiat (section 4.5).

### 2.10 Technique et production : les décisions manquantes

**Constat.** Ni l'entité simulée (l'escouade ou ses membres ?), ni le modèle de déterminisme, ni la navigation ne sont décidés, alors qu'ils conditionnent l'architecture. Le plan n'a pas de critère d'arrêt à l'étape A, l'étape B contient 60 % du jeu, et l'essai réseau exigé à la section 13 n'apparaît dans aucune étape. Le contenu n'est pas chiffré : environ 160 clips d'animation même avec un squelette commun, et une IA à tenir sur 6 affrontements.
**Effet.** Une étape B qui dure dix-huit mois et devient le jeu sans avoir été testée par un joueur extérieur.
**Correction.** Sections 8 et 9.

---

## 3. Arbitrages

| Décision | Élément | Justification |
|---|---|---|
| **Conserver** | Trois factions, duel comme socle, miroirs compris | Contrainte fixée ; six affrontements suffisent à la V1 |
| | Escouade comme unité, personnages visibles | Bonne échelle d'attachement et de contrôle |
| | Repli volontaire, reconstitution payante | La question devient « quand est-ce que je lâche », pas « qui gagne » |
| | Objectifs séparés de l'économie ; rien à l'élimination | Trois lieux tirent l'armée ; pas d'emballement |
| | Effets annoncés, contrôles courts, pas de héros, passants décoratifs | Défaites compréhensibles ; garde-fou de ton |
| | Deux ressources, revenu de base | À condition de les distinguer par la source |
| | Simulation séparée, ordres communs, données éditables | Rend possibles tests, relectures, IA contre IA, réseau |
| | Barricades sur emplacements prévus | Une barricade devient une arête fermée, pas un problème de navigation |
| | Unreal Engine, pour tout | Votre décision du 11 novembre 2026 ; précautions en 8.2, modèles en 8.9 |
| **Modifier** | Positionnement | RTS d'escouades positionnel à base lisible ; de StarCraft, l'asymétrie dès la première minute |
| | Intégrité et cohésion | Effectif visible et cohésion, deux échelles de temps (R1) |
| | Score et prolongation | Écart × taux croissant, 600 points, mort subite à 20:00 |
| | Règle du contesté | Propriété persistante : pour arrêter le score, il faut faire rompre le défenseur |
| | Neutralisation du QG | Occupation de 60 s, production maintenue |
| | Économie | Équipes postées, Équipement aux seules expansions, désordre qui coupe le revenu |
| | Trois plans par faction | Tenus, avec un écart assumé : la technologie exige une expansion (4.3) |
| | RELAIS, POSTURES, SECTEURS | Sortie et transit ; ancrage directionnel et poussée ; périmètre de recharge et sommations |
| | Rosters et noms | Trous assumés ; un nom, un objet, un geste |
| | Plafond de 12 escouades | 50 points de population et 16 escouades au plus ; effectifs visibles différents par camp |
| | Durée cible | 10 à 20 minutes pour une partie disputée, plafond à 25 |
| | Architecture | Simulation dans un module C++ du projet Unreal, sans classe de jeu du moteur, conçue pour être déterministe |
| | Plan A à D | A1, A2, A3, B1, B2, C, D, avec critères mesurables et critère d'arrêt |
| **Supprimer** | Navettes de récolte, bâtiments de capacité | Corvée sans décision |
| | Auras, bonus de formation, unités porteuses passives | Récompensent l'empilement ; taxes qu'on produit sans les jouer |
| | Règle « contesté ne compte pas » | Rend la contestation au rabais dominante |
| | Deux soigneurs sur trois, et tout soin de terrain en V1 | La reconstitution se fait dans les zones de soutien |
| | Destruction de décor, voix intelligibles | Coût élevé, apport faible ; le brouhaha sert mieux le thème |
| **Reporter** | Troisième palier | Seulement si les parties de test dépassent régulièrement 14 minutes |
| | Six unités sur 24 | 18 unités en V1 ; les six autres sont définies et attendent |
| | Transport de troupes en véhicule | L'animation la plus chère par seconde d'écran |
| | Quatrième carte, deux styles d'IA sur quatre, éditeur | Deux cartes excellentes valent mieux que quatre moyennes |
| | Multijoueur public, modes à plus de deux, campagne | Mais un essai réseau a lieu en B2 et sert ensuite d'outil de test |
| | Idées des conceptions libres : tension des quartiers et opinion filmée, convois interceptables, vent qui déplace les fumées, bruit des groupes entendu dans le brouillard, finale sur un objectif unique, entretien d'armée | Bonnes idées, mais chacune ajoute une jauge ou une simulation ; à essayer une par une après B2 |

---

## 4. Concept amélioré

**Proposition.** *On ne détruit rien : on fait rompre, on occupe, et on empêche de revenir.* Un RTS d'escouades en duel, dans une ville fictive, où trois camps tiennent la rue de trois façons : la Convergence apparaît où on ne l'attend pas, le Bastion avance et ne recule pas, la Préfecture frappe fort mais rarement.

**Piliers**

1. **Rompre.** Le combat porte sur la cohésion, pas sur la destruction.
2. **La rue.** Sa largeur limite qui se bat ; ses angles limitent ce qu'on voit.
3. **Occuper.** Objectifs, dépôts, relais et QG changent de mains ; rien n'est rasé.
4. **Trois macros.** Les camps diffèrent dès la première minute par l'endroit où ils apparaissent, la manière dont ils se tiennent et le moment où ils sont forts.

### 4.1 Les six règles de combat et de terrain

**R1 — Rupture.** Chaque escouade a une **cohésion** (100 à effectif complet, 50 pour les éclaireurs) et un **effectif**, ses membres visibles. Les attaques n'infligent que de la pression, qui fait baisser la cohésion.

- À zéro, l'escouade est **rompue** pendant 6 s ★. Elle perd un **cran** : un quart de son effectif complet, arrondi au plus proche, un membre au moins (2 têtes pour un Cortège de 8 ou des Piquets de 6, 1 pour une Patrouille de 3). Elle ne peut ni attaquer ni tenir ou prendre un lieu, se déplace 20 % plus vite et **reste commandable**.
- Tant qu'elle est rompue, à l'arrêt (bloquée, encerclée ou tenue sur ordre) et au contact d'un ennemi non rompu, elle perd un cran à 3 s puis à 6 s ★. Une escouade rompue qui s'éloigne ne perd rien de plus. Hors rupture, aucune perte (contact, Interpellation) ne retire le dernier membre, même quand le cran vaut deux têtes : il faut une seconde rupture pour éliminer une escouade. C'est ce qui rend l'encerclement décisif sans règle supplémentaire, et ce qui laisse toujours une fenêtre de réaction.
- Elle revient à 40 % de son plafond de cohésion et ne peut pas rompre de nouveau pendant 8 s.
- Plafond de cohésion = base × (0,4 + 0,6 × effectif ÷ effectif complet). La pression exercée est proportionnelle à l'effectif.
- Récupération : +8 par seconde après 3 s sans pression ★. Aucune récupération sous pression, et aucun bonus de voisinage.
- Par défaut, une escouade rompue laissée sans ordre recule vers la zone de soutien la plus proche, selon la règle de chemin du repli (R3), jusqu'à la fin de la rupture. Le réglage « tenir quoi qu'il arrive » est par escouade.
- Deux signaux à l'écran : la barre de cohésion, qui passe à l'orange sous 40 %, et le nombre de têtes.

La décision demandée existe alors à chaque engagement : relever l'escouade ébranlée, ou la laisser dix secondes de plus pour le score.

**Critère d'abandon.** Si, au prototype, moins de 40 % des ruptures sont précédées d'un ordre du joueur sur l'escouade dans les 10 s, la jauge ne produit pas de décision : la remplacer par un état binaire « sous pression » infligé par quelques unités dédiées.

**R2 — Face, flanc, largeur de rue.**

- Une escouade fait face à sa cible. Toute pression reçue hors de son arc frontal de 120° est multipliée par 1,5 ★.
- Le contact n'existe qu'entre escouades adjacentes. Une **rue** laisse passer 2 escouades de front, une **avenue** 4, une **place** n'a pas de limite. Un **passage** se traverse à une escouade à la fois ; on ne s'y arrête pas et on ne s'y bat pas.
- Les escouades amies en mouvement se traversent ; seuls les emplacements d'arrivée sont exclusifs. Les escouades ennemies se bloquent : barrer une rue est une action, pas un accident.
- Les escouades du second rang ne pressent pas. Elles relèvent : échange de place avec l'escouade de devant en 1,5 s.
- Trois sortes de pression : le **contact**, entre escouades adjacentes ; le **tir**, à distance sur une cible (Frondeurs) ; la **zone annoncée** (Salve, Mur du son, Jet du Canon à eau). Une zone n'est réduite par rien, ni protection ni ancrage : on l'évite en sortant.
- **Protégé** : pression de contact et de tir reçue de face × 0,5. Les multiplicateurs de pression se multiplient entre eux.
- **Véhicule** : pas de cohésion mais des points de structure, entamés seulement par les outils (Démontage, Enfoncement, Percée). Il ne roule que sur chaussée, s'arrête devant toute escouade ennemie ou barricade, et ne barre pas la voie aux escouades.

C'est la règle qui borne l'armée en boule : dans une rue, la troisième escouade n'ajoute aucune pression, elle ne sert qu'à relever.

**R3 — Repli et reconstitution.**

- **Repli** : ordre irréversible. L'escouade court à +30 % vers la zone de soutien amie la plus proche par un chemin que ne ferme ni escouade ennemie non rompue ni barricade ; s'il n'en existe pas, l'ordre est refusé ; si la zone tombe ou si le chemin se ferme, la destination est recalculée. Elle traverse les escouades amies, ne presse pas, et ne tient, ne gèle ni ne garde aucun lieu. Tant qu'elle avance, elle subit la moitié de la pression et ne perd qu'un cran si elle rompt ; bloquée, elle subit la pression entière et la perte au contact de R1. Une escouade encerclée ne s'échappe donc pas par le repli.
- **Zones de soutien** : le QG et les expansions (parvis de 12 m), le relais et le cantonnement (8 m), le secteur (30 m).
- **Reconstitution** : dans une zone de soutien, pour une escouade non rompue qui n'a reçu aucune pression depuis 3 s ; à 60 % du coût, Moyens et Équipement, au prorata des membres manquants ; 4 s par membre. Aucun soin ailleurs en V1.

**R4 — Occuper, pas détruire.** Une **escouade de combat** est toute escouade qui occupe de la population, éclaireurs compris ; ni une équipe logistique ni un véhicule. Une escouade de combat non rompue, sans ennemi non rompu dans la zone, **neutralise** puis **prend** un lieu. La présence simultanée gèle la progression sans la remettre à zéro ni changer le propriétaire. Pour geler une progression, garder un dépôt (E5) ou défendre un parvis (V5), une escouade doit être au contact d'un ennemi ou à l'arrêt depuis 3 s ★ : un éclaireur qui tourne autour ne garde rien. La zone d'un objectif a un rayon de 10 m ★.

| Lieu | Durée d'occupation sans défenseur | Effet |
|---|---|---|
| Objectif neutre | 10 s | Pris |
| Objectif tenu | 10 s, puis 10 s | Neutralisé, puis pris |
| Relais ; Camion-sono à l'arrêt | 10 s | Retiré ; emplacement de relais verrouillé 60 s |
| PC mobile, sauf replié | 15 s ★ | Retiré ; son secteur se ferme |
| Cantonnement ; Tracteur à l'arrêt | 20 s | Retiré |
| Expansion | 12, 20 ou 30 s selon la faction (4.4) | Fermée ; rouverte par 10 s d'occupation de son propriétaire |
| QG | 60 s cumulées, 12 points de population au moins (V5) | Défaite |

Les **barricades** se posent sur des emplacements prévus (équipe logistique, 50 Moyens, 15 s, 150 points de structure) et ferment la voie aux escouades comme aux véhicules. Toute escouade de combat non rompue au contact en démonte une en 15 s ★ ; un seul usage d'outil suffit (canalisation de 3 s ou ruée). Deux barricades actives par camp au plus ★. Hors de son poste, une équipe logistique est renvoyée à son dépôt par toute escouade ennemie adjacente ; elle n'est jamais éliminée.

**R5 — Effets annoncés, contrôles bornés.** Tout effet de zone affiche sa forme et son compte à rebours au moins 1,5 s avant. Tout contrôle (recul, ralentissement, interruption) dure 3 s au plus et donne 8 s d'immunité. Aucun effet ne retire plus d'un cran à la fois.

**R6 — Voir la rue.** Le brouillard suit les lignes de vue : on voit les rues où l'on a des yeux, les immeubles coupent la vue. Vision de 18 m pour une escouade, de 24 à 30 m pour les éclaireurs.

### 4.2 Victoire

- **V1.** Trois objectifs sur la médiane, à temps de trajet égal des deux QG (tolérance 5 %), aucun à moins de 60 m d'un QG. Tenir deux objectifs impose de se diviser.
- **V2.** Les objectifs suivent R4. **Un objectif reste à son propriétaire, et lui rapporte, tant qu'il n'est pas neutralisé.** Ni les équipes logistiques ni les véhicules ne capturent.
- **V3.** À partir de 2:00 : points par seconde = (objectifs tenus − objectifs adverses) × taux. Taux de 0,5 jusqu'à 8:00, de 1 jusqu'à 14:00, de 2 ensuite. Chaque changement est annoncé 15 s avant.
- **V4.** Premier camp à 600 points ★.
- **V5.** Le QG adverse tombe après 60 s cumulées d'occupation de son parvis par au moins 12 points de population d'escouades de combat non rompues. La jauge monte quand aucun défenseur non rompu n'est sur le parvis, se fige tant qu'il y en a un, et redescend d'une seconde par seconde quand l'occupant n'a plus 12 points sur place. Alerte immédiate ; la production continue et sort contester.
- **V6.** À 20:00, mort subite : un objectif d'écart tenu 60 s d'affilée gagne. À 25:00, le score le plus élevé gagne ; égalité, partie nulle.

Durées calculées sur ce barème, hors temps de score gelé : 8:20 pour une domination totale, 10:00 à deux objectifs contre zéro, 14:30 avec un objectif d'écart constant, 19:30 pour une partie où l'écart d'un objectif change de camp sans arrêt. Les six premières minutes pèsent 180 points au plus à un objectif d'écart : l'avance précoce compte sans décider.

Le score est la victoire principale. Le QG conclut une partie gagnée et sanctionne une base abandonnée ; la pression sur la base reste une stratégie, mais par ses effets économiques. Cible à mesurer : 10 à 25 % des parties finies par le QG, et moins de 70 % des victoires d'une faction par la même condition.

### 4.3 Économie

- **E1.** Départ : QG, 4 équipes logistiques, 150 Moyens, 0 Équipement, et pour chaque faction ses escouades de départ et son premier soutien avancé offert (section 5).
- **E2.** Une équipe coûte 50 Moyens, 12 s, et n'occupe pas de population. Elle est **postée** sur une place de dépôt, sans navette, et se déplace à 3,4 m/s ★ quand on l'envoie bâtir. Elle rend 30 Moyens par minute sur une place de Moyens, ou 30 Équipement par minute ★ sur une place d'Équipement.
- **E3.** Le QG offre 6 places de Moyens et un revenu de base de 60 Moyens par minute, non réductible.
- **E4.** Deux emplacements d'expansion par camp, l'un abrité, l'autre exposé : 250 Moyens et 30 s en valeur médiane (coût, durée et délai de fermeture varient par faction, 4.4), 3 places de Moyens et 2 places d'Équipement. **L'Équipement n'existe qu'aux expansions** : on ne monte pas en technologie enfermé chez soi.
- **E5. Désordre.** Une place ne rapporte rien tant qu'une escouade de combat ennemie non rompue se trouve à moins de 15 m **sans escouade de combat amie non rompue dans ce même rayon**, et pendant 10 s après. Les équipes s'abritent et ne sont pas des cibles. Un dépôt gardé ne se dérange donc qu'en faisant rompre sa garde.
- **E6.** Plafond fixe : 50 points de population ★ et 16 escouades de combat au plus ★. Aucun bâtiment de capacité.
- **E7. Production.** Au QG, une file logistique et une file d'escouades ; une file par bâtiment de branche. Durées ★ : équipe 12 s, éclaireur 12 s, Cortège 24 s (au prorata de son coût, pour que le camp du nombre ne soit pas étranglé par la file), autre escouade de palier 1 en 30 s, de palier 2 en 35 s, véhicule 45 s.
- **E8.** Ni le score ni les éliminations ne donnent de ressources.

**Rendements qui en découlent.** 180 Moyens par minute au départ, 240 QG saturé, 420 Moyens et 120 Équipement par minute avec deux expansions pleines. Une expansion coûte de 450 à 550 Moyens avec ses cinq équipes et se rembourse en 2:09 (Convergence), 2:23 (Préfecture) ou 2:37 (Bastion), l'Équipement étant compté double.

**Plafond de population.** En misant tout sur les escouades de palier 1, sans ajouter d'équipe, il tombe vers 5:10 pour la Préfecture et vers 5:25 pour la Convergence et le Bastion, borné par les Moyens plus que par la file. C'est encore tôt. À mesurer en B1 : si le plafond tombe avant 7:00 dans des parties normales, où l'expansion et le palier absorbent une part du revenu, allonger la production ou baisser le rendement des équipes, sans ajouter de système.

**Trois plans par faction.** *Pression* : aucune expansion, uniquement les unités payées en Moyens, premier engagement vers 0:45. *Technologie* : une expansion, palier 2 dès que les 100 Équipement sont réunis, soit vers 3:40 sur le papier. *Économie* : deux expansions, palier plus tardif, armée plus large. Écart assumé à votre section 10 : la technologie exige une expansion.

Ce qui reste comme décisions : expansion ou escouades à la première minute, laquelle des deux expansions, quand payer le palier, quelle branche, reconstituer ou remplacer, raid ou objectif. C'est suffisant ; la seconde ressource se justifie parce qu'elle vit ailleurs que la première.

### 4.4 Progression, bâtiments, carte

- **Deux paliers en V1.** Le palier 2 coûte 200 Moyens et 100 Équipement, 40 s, au QG. Il ouvre **deux branches**, chacune un bâtiment distinct sur un emplacement du QG, construit en 30 s. La première coûte 150 Moyens et 50 Équipement, la seconde 50 % de plus. Les unités de palier 2 sortent du bâtiment de leur branche ; celles de la Convergence, au relais choisi. La reconnaissance a ainsi quelque chose à lire, et l'ouverture optimale dépend de ce qu'on voit.
- **Cinq structures par faction** : QG, expansion, soutien avancé, branche A, branche B.
- **Installation asymétrique**, même squelette ★ :

| | Expansion | Fermée après | Soutien avancé |
|---|---|---|---|
| Convergence — occupe | 200 Moyens, 20 s | 12 s d'occupation | Relais : beaucoup, fragiles, fixes |
| Bastion — fortifie | 300 Moyens, 40 s | 30 s | Cantonnement : peu, solides, fixes |
| Préfecture — déploie | 250 Moyens, 30 s | 20 s | Secteur : un seul, mobile |

- **Carte de référence** : symétrique, environ 260 m entre les QG, trois objectifs sur la médiane espacés de 80 m, soit 40 s à pied du QG à la médiane et 25 s entre objectifs voisins. Chaque objectif a trois approches, dont une avenue ; une seule de ces approches au plus, et aucune sortie de QG, porte un emplacement de barricade. Des passages marqués relient certains îlots ; des emplacements marqués accueillent relais et cantonnements.
- **Lisibilité** : immeubles tronqués à un niveau en vue de jeu, aucune rue jouable plus étroite que deux escouades, contour des escouades visible à travers les obstacles, fumées de 8 s et 40 % d'opacité au plus avec les unités dessinées par-dessus.

### 4.5 Budget de règles et ordre d'apprentissage

Budget : six règles de combat et de terrain communes, trois par faction, une capacité active par escouade, aucune aura. La victoire et l'économie tiennent chacune sur un écran. Tout ajout doit retirer autre chose.

Première partie amusante avec six notions : déplacer, tenir un objectif, la cohésion, la rupture, un geste de faction, une unité de contre. L'économie s'apprend ensuite, les paliers en dernier. Critère : un testeur qui découvre le jeu gagne une partie d'initiation de huit minutes en moins d'une demi-heure et sait dire pourquoi.

Côté développement, les mécaniques entrent par étapes : cohésion et postures du Bastion au prototype (A3), relais de la Convergence en B1, secteur et dotations de la Préfecture en B2. Une signature que l'IA ne sait pas jouer à la fin de B2 est simplifiée, pas retirée : l'asymétrie des trois camps est une contrainte fixée.

### 4.6 Ton

**Décision recommandée : la bagarre burlesque stylisée**, nerveuse, où personne ne meurt ni ne saigne et où chacun est à la fois attachant et ridicule. Elle résout trois problèmes d'un coup : le miroir Préfecture contre Préfecture devient jouable, les trois camps sont moqués à égalité, et le risque de réception baisse.

Règles d'écriture et de direction artistique :

1. Aucune arme à feu, aucune lame, aucun feu sur un personnage ; on pousse, on bloque, on arrose, on assourdit.
2. Jamais de coup sur un personnage à terre ; l'interpellation n'est pas mise en scène comme une humiliation.
3. L'enjeu de la journée n'est jamais énoncé : aucune revendication, aucune cause, aucun événement réel.
4. Aucun drapeau, emblème, slogan, sigle, uniforme ou personnalité réels ; aucune couleur de parti. Palette hors codes partisans, doublée de motifs (rond, carré, chevron).
5. Parité tenue dans un tableau : par camp, une vertu, un travers comique, le même nombre de moqueries.
6. Les camps se définissent par leur façon d'occuper la rue, jamais par une opinion.
7. Tout texte passe le test de l'échange : s'il serait inacceptable dit d'un autre camp, il sort.
8. Les mots « gauche » et « droite » peuvent rester dans la communication du projet ; je déconseille de les écrire dans le jeu.

Le nom « La Préfecture » décalque une institution réelle. Il reste utilisable ; « Le Cordon » est une alternative cohérente avec le réseau et le bloc. Je garde vos trois noms dans ce document.

---

## 5. Factions

Lecture des tableaux : coût en Moyens / Équipement ; pression en points de cohésion par seconde, escouade complète ; vitesse en m/s. Cohésion de 100 à effectif complet, 50 pour les trois éclaireurs (Vigies, Lévriers, Motards). Les durées de production sont en E7.

### 5.1 La Convergence — apparaître

**Identité.** Beaucoup de têtes dans des escouades fragiles, qui ne tiennent rien de front mais ressortent là où on ne les attend pas, tant que le réseau tient.

**Signature : RELAIS**

1. Une équipe logistique pose un relais sur un emplacement marqué (cour, hall, kiosque), à plus de 25 m de tout objectif : 75 Moyens, 20 s, 3 points de population réservés. Trois relais ; un quatrième avec la branche Kiosque. Un seul Camion-sono ★, hors plafond : à l'arrêt, il vaut un relais et en suit les règles, sans effet à moins de 25 m d'un objectif.
2. Les recrues sortent au relais choisi. Une escouade hors combat au contact d'un relais transite vers un autre en 10 s ★. Chaque relais ne reçoit qu'une escouade, recrue ou transit, toutes les 30 s ★ et se révèle 10 s à chaque usage.
3. Un relais est une zone de soutien sans aucun bonus de combat. Il tombe après 10 s d'occupation (R4).

**Départ.** 2 Cortèges, et le premier relais offert, à poser dès 0:00 : vers un objectif pour presser, ou en retrait pour sécuriser l'expansion.

**Trous assumés.** Aucune ligne protégée, aucun véhicule de combat, aucune portée.

| Unité | Remplace | Palier | Geste visible | Rôle | V1 |
|---|---|---|---|---|---|
| **Cortège** | Manifestants organisés | 1 | La Chaîne : bras liés, immobile, barre la rue | Tenir, capturer | oui |
| **Vigies** (à vélo) | Éclaireurs | 1 | Coup de sifflet : marque une escouade 10 s | Voir | oui |
| **Furets** | Autonomes | 1 | Passe-cour : traverse un passage d'immeuble marqué | Flancs, spécialistes isolés | oui |
| **Démonteurs** | Équipe de rupture | 2, branche Atelier | Arrachent boucliers, barricades, roues | Anti-protégé | oui |
| **Fanfare** | Collectif de pression | 2, branche Kiosque | Mur du son : cône annoncé | Zone ; déloge ce qui est ancré | oui |
| **Camion-sono** | Char de mobilisation | 2, branche Atelier | Relais roulant, actif à l'arrêt | Soutien avancé mobile | oui |
| **Secouristes** | Secouristes | 2 | Relèvent un membre tombé depuis moins de 15 s | Seul soin de terrain du jeu | après V1 |
| **Mégaphone** | Coordinateurs | 2 | Appel : deux escouades en attente à un relais sortent à sa position | Relais ponctuel | après V1 |

Branches : **Atelier** (Démonteurs, Camion-sono) ou **Kiosque** (Fanfare, quatrième relais).

| Unité | Palier | Coût | Pop | Effectif | Pression | Vitesse | Capacité | Forte contre | Contrée par |
|---|---|---|---|---|---|---|---|---|---|
| Cortège | 1 | 80 / 0 | 3 | 8 ★ | 4,0 au contact | 3,4 | Chaîne (bascule en 2 s) : pression de face reçue −30 %, immobile, barre la rue, ne presse plus. Occupe un objectif 1,5 fois plus vite (10 s → 6,7 s par phase) si tous les occupants sont des Cortèges ★ ; sans effet sur les autres lieux | Objectifs vides ; Patrouille à deux contre un | Zones ; Piquets et Pavois ancrés |
| Vigies | 1 | 50 / 0 | 2 | 2 | 1,0 | 6,5 ; vision 30 m | Sifflet : cible visible 10 s, recharge 20 s | Rien ; trouve le PC, les ancrages, les branches | Motards sur chaussée |
| Furets | 1 | 110 / 20 | 4 | 5 | 5,5 au contact ★ | 4,2 | Passe-cour : traversée en 4 s, recharge 15 s | Spécialistes isolés, flancs, dépôts mal gardés | Lignes ancrées ou protégées prises de face ; Patrouille |
| Démonteurs | 2 | 100 / 60 | 4 | 4 | 6,0 au contact ★ | 3,4 | Démontage : tant qu'ils sont au contact, la cible perd Protégé et Mur, pas la réduction d'ancrage ★. Canalisation de 3 s : −150 points de structure | Pavois, Compagnie, barricades, véhicules | Infanterie légère en nombre ; Frondeurs |

### 5.2 Le Bastion — tenir et pousser

**Identité.** Peu d'escouades épaisses, qui gagnent tout affrontement frontal préparé, avancent par bonds, et perdent ce qu'elles subissent de flanc ou en marche.

**Signature : POSTURES**

1. Toute infanterie du Bastion, sauf les Lévriers, s'ancre en 3 s et se lève en 2 s ★. Ancrée, elle est immobile, sa face est fixée, et elle barre ses cases.
2. Ancrée : pression reçue de face −40 % ★ et fonction propre renforcée (mur, portée). Aucun bonus entre voisines : une voisine ne couvre que physiquement un flanc.
3. **Poussée** : après 5 s d'ancrage, charge en ligne de 12 m, 25 de pression à l'impact et recul de 3 m des escouades touchées, qui perdent leur ancrage ; recharge 25 s. Avancer, c'est : bond, ancrage, poussée.

**Soutien avancé : le cantonnement.** Un au palier 1, un second au palier 2 ; 150 Moyens, 25 s, bâti par une équipe sur un emplacement marqué ; il tombe après 20 s d'occupation (R4). À l'arrêt, le Tracteur vaut un cantonnement et en suit les règles.

**Départ.** 2 Piquets, et le premier cantonnement offert, à faire bâtir dès 0:00 là où l'on compte tenir. L'ancrage a lieu à l'arrivée sur l'objectif, vers 0:45 ; ancrés, ses Piquets doivent être la meilleure tenue du début de partie ★.

**Trous assumés.** Pas de soin, pas d'assaut mobile, reconnaissance médiocre, aucune zone à distance.

| Unité | Remplace | Palier | Geste visible | Rôle | V1 |
|---|---|---|---|---|---|
| **Piquets** | Militants de ligne | 1 | S'ancrent, poussent | Ligne | oui |
| **Lévriers** | Voltigeurs | 1 | Sprint | Voir, capturer | oui |
| **Pavois** (portes dégondées) | Garde du Bastion | 1 | Plantent le mur | Ligne protégée | oui |
| **Béliers** (madrier) | Percuteurs | 2, branche Charpente | Enfoncement : ruée annoncée | Anti-protégé, structures, véhicules | oui |
| **Frondeurs** | Groupe de pression | 2, branche Stand | Tir tendu, plus long une fois ancrés | Distance | oui |
| **Tracteur** | Fourgon de ralliement | 2, branche Charpente | Pousse barricades et véhicules ; soutien à l'arrêt | Véhicule, soutien avancé mobile | oui |
| **Bâtisseurs** | Secouristes de terrain | 2 | Montent et démontent | Terrain | après V1 |
| **Tambour** | Porte-étendard | 2 | Ralliement : les escouades rompues à 15 m se reforment | Sursaut | après V1 |

Branches : **Charpente** (Béliers, Tracteur) ou **Stand** (Frondeurs, ancrage en 2 s).

| Unité | Palier | Coût | Pop | Effectif | Pression | Vitesse | Capacité | Forte contre | Contrée par |
|---|---|---|---|---|---|---|---|---|---|
| Piquets | 1 | 100 / 0 | 4 | 6 | 5,0 au contact | 3,2 | Posture ; Poussée ★ | Cortège ; Patrouille de face | Furets de flanc ; zones ; tout ce qui contourne |
| Lévriers | 1 | 60 / 0 | 2 | 3 | 1,5 | 6,0 ; vision 26 m | Sprint : +50 % pendant 4 s, recharge 20 s | Objectifs vides | Toute ligne ; Motards |
| Pavois | 1 | 120 / 30 | 5 | 4 | 4,0 au contact | 2,6 ★ | Protégé. Mur, une fois ancrés : tirs de face × 0,3 de plus, à la place de la réduction d'ancrage ; au contact, c'est la réduction d'ancrage qui s'applique ★ | Furets et Cortège de face ; Patrouille | Démonteurs, Béliers, Canon à eau ; flanc |
| Béliers | 2 | 110 / 60 | 4 | 4 | 6,0 au contact ★ | 3,2 | Enfoncement : 2,5 s de préparation visible, ruée de 10 m, 40 de pression, la cible perd ancrage et protection 5 s ★ ; recharge 30 s. −150 structure par ruée | Compagnie, Pavois, relais, PC mobile, barricades | Masse légère ; harcèlement |

### 5.3 La Préfecture — frapper et tourner

**Identité.** Très peu d'agents, chers, qui dispersent plus qu'ils n'usent, frappent fort tant qu'ils ont leurs dotations, puis doivent tourner.

**Signature : SECTEUR, DOTATIONS, SOMMATIONS**

1. Un **secteur** est un rayon de 30 m ★ autour du QG ou d'un PC mobile déployé (12 s pour déployer, 8 s pour replier). Un PC mobile ; un second avec la branche Intervention. C'est une zone de soutien ; il ne donne aucun bonus de combat. Un PC en cours de déploiement, déployé ou en cours de repli est retiré après 15 s d'occupation (R4) ; le repli n'interrompt pas le décompte.
2. Chaque escouade porte 2 **dotations**. Toute capacité en consomme une. Elles ne se rechargent que dans un secteur, une toutes les 20 s ★.
3. **Sommations** : les capacités de la Préfecture sont voulues parmi les plus fortes du jeu et sont les plus annoncées, zone affichée à tous de 1,5 à 3 s avant l'effet.

La Préfecture gagne le terrain plus que l'attrition. Comme tout camp, elle retire un cran par rupture et au contact (R1) ; l'Interpellation en retire un de plus, à distance.

**Départ.** 1 Compagnie ★, 1 Motards, et le premier PC mobile offert, replié au QG : les Motards partent voir, le PC part se déployer, la Compagnie garde ses deux Salves pour le premier engagement. Pourquoi une Compagnie : sur le papier, une Patrouille à sa place perd ce premier engagement contre deux Cortèges comme contre deux Piquets, et aucune capacité payée en Moyens ne crée de rupture. L'avantage du premier engagement reste à mesurer par faction en B2.

**Plan offensif.** Le bond : PC avancé, sommation, Salve ou Jet, la Compagnie avance dans l'espace libéré, la Patrouille interpelle ce qui a rompu, puis le secteur se déplace. La Préfecture ne détruit rien, elle rétrécit la carte de l'autre.

**Trous assumés.** Pas de soin, pas de nombre, pas de longue portée, aucune endurance hors secteur.

| Unité | Remplace | Palier | Geste visible | Rôle | V1 |
|---|---|---|---|---|---|
| **Patrouille** | Patrouille | 1 | Interpelle | Base ; alourdit les ruptures | oui |
| **Motards** | Brigade motorisée | 1 | Poursuivent | Voir, poursuivre | oui |
| **Compagnie** | Compagnie de maintien de l'ordre | 1 | Salve annoncée | Ligne protégée, zone | oui |
| **PC mobile** | Poste de commandement mobile | 1 | Trace le secteur | Signature | oui |
| **Groupe d'intervention** | Unité d'intervention | 2, branche Intervention | Percée annoncée | Ouvre mur ancré, barricade, véhicule | oui |
| **Canon à eau** | Véhicule à eau | 2, branche Parc d'engins | Jet en arc annoncé | Zone, refoulement | oui |
| **Équipe drone** | Équipe d'assistance | 2 | Montre une zone 15 s | Renseignement | après V1 |
| **Car de section** | Escadron mobile | 2 | Transporte deux escouades sur chaussée | Rotation | après V1 |

Branches : **Intervention** (Groupe d'intervention, second PC mobile) ou **Parc d'engins** (Canon à eau, recharge des dotations en 15 s).

| Unité | Palier | Coût | Pop | Effectif | Pression | Vitesse | Capacité | Forte contre | Contrée par |
|---|---|---|---|---|---|---|---|---|---|
| Patrouille | 1 | 110 / 0 | 4 | 3 ★ | 6,0 au contact ★ | 3,4 | Interpellation (1 dotation) : 2 s à 6 m, retire un cran de plus à une escouade rompue ★ | Escouades légères isolées ou rompues ; Furets | Le nombre ; Piquets ancrés |
| Motards | 1 | 70 / 0 | 3 | 2 | 3,0 | 8 sur chaussée ★, 5 ailleurs ; vision 24 m | Poursuite (1 dotation) : ralentit 2 s une escouade rompue ou en repli | Vigies, Lévriers ; Furets rompus ou en repli ; dépôts sans garde | Toute ligne ; barricades ; Chaîne |
| Compagnie | 1 | 140 / 40 | 6 ★ | 4 | 5,0 au contact | 2,6 | Protégé. Salve (1 dotation) : zone de 5 m à 14 m, annoncée 1,5 s, 35 de pression ★ | Cortèges groupés ; Piquets en marche | Démonteurs, Béliers ; feintes qui vident les dotations ; flanc |
| PC mobile | 1 | 150 / 0 | 3 | véhicule, 400 de structure | aucune | 5, chaussée seulement | Déploiement en 12 s, repli en 8 s ★ | Rien ; rend le reste possible | Occupation de 15 s par n'importe quelle escouade ; Démonteurs, Béliers |

### 5.4 Contrôle contre les six menaces

Entre parenthèses, le palier de la première réponse. Trois précisions :

- Furets, Pavois et Compagnie coûtent de l'Équipement : ces réponses de palier 1 supposent une expansion ouverte, donc pas avant la deuxième ou la troisième minute.
- Tout véhicule s'arrête devant n'importe quelle escouade, et toute escouade démonte une barricade en 15 s (R2, R4) : la réponse de palier 1 existe partout, les outils de palier 2 sont la réponse rapide.
- La V1 n'ayant que deux paliers, le palier 2 est le dernier. Face à une ligne protégée ancrée, la Préfecture a la Salve dès le palier 1, puisqu'une zone n'est réduite par rien. Le Bastion n'a que la Poussée, réponse lente, et sa réponse franche, les Béliers, tient à une seule branche. **Écart à votre règle de la section 10, non résolu** : à mesurer en B2, et à corriger en descendant les Béliers au palier 1 si l'écart se confirme.

| Menace | Convergence | Bastion | Préfecture |
|---|---|---|---|
| Masse légère | Le nombre (1) ; Fanfare (2). La Chaîne retarde, elle ne presse pas | Piquets ancrés (1) | Salve de la Compagnie (1) |
| Ligne protégée | Furets de flanc (1), Démonteurs (2) | Poussée, qui fait reculer et lever l'ancrage (1) ; Béliers (2) | Motards par le côté, Salve sur ce qui est ancré (1) ; Intervention ou Canon à eau (2) |
| Spécialistes à distance | Furets (1) | Pavois ancrés (1) | Motards (1) |
| Pression en plusieurs points | Transit par relais (1) | Garde des dépôts, cantonnement, Lévriers (1) : point faible assumé | Motards, redéploiement du PC (1) |
| Position défensive | Passe-cour, démontage à la main (1) ; Fanfare ou Démonteurs (2) | Poussée, démontage à la main (1) ; Béliers ou Frondeurs (2) | Salve, démontage à la main (1) ; Intervention ou Canon à eau (2) |
| Véhicules | Toute escouade l'arrête ; occupation du PC (1) ; Démonteurs (2) | Toute escouade l'arrête ; occupation du PC (1) ; Béliers (2) | Toute escouade l'arrête (1) ; Intervention (2) |

### 5.5 Effectifs à l'écran et charge de contrôle

Le nombre de têtes porte l'asymétrie « masse contre élite » : 8 par escouade de base pour la Convergence, 6 pour le Bastion, 3 pour la Préfecture. À population pleine, cela va d'une trentaine de personnages (Préfecture) à une centaine (Convergence tout en Cortèges, relais déduits). Le nombre d'escouades varie aussi, de 8 à 16 selon le camp et la composition : la charge de contrôle n'est pas la même pour les trois camps et doit être mesurée par camp. Budget d'affichage à mesurer dès le prototype : 130 personnages par camp, 260 à l'écran dans le miroir Convergence.

---

## 6. Équilibrage

### 6.1 Lecture d'intention

Ces durées sont de l'arithmétique sur les hypothèses de la section 5, escouades complètes, pas un résultat d'équilibrage.

| Engagement | Temps avant rupture |
|---|---|
| Cortège presse des Piquets en marche / ancrés | 25 s / 41,7 s |
| Piquets pressent un Cortège | 20 s |
| Patrouille presse des Piquets en marche / ancrés | 16,7 s / 27,8 s |
| Piquets pressent une Patrouille | 20 s |
| Deux Cortèges (160 Moyens) pressent une Patrouille (110) | 12,5 s |
| Deux Cortèges de face pressent des Pavois en marche / ancrés | 25 s / 41,7 s |
| Un Cortège de face et des Furets de flanc pressent des Pavois en marche / ancrés | 9,8 s / 10,6 s |
| Furets pressent une Compagnie de flanc / de face | 12,1 s / 36,4 s |
| Démonteurs pressent des Pavois en marche / ancrés | 16,7 s / 27,8 s |
| Pavois pressent des Démonteurs | 25 s |
| Patrouille presse des Furets / Furets pressent une Patrouille | 16,7 s / 18,2 s |

Lecture : la posture inverse l'issue Patrouille contre Piquets ; le flanc divise par deux et demi à quatre le temps de rupture d'une ligne protégée ; deux escouades bon marché battent une escouade chère prise seule ; l'anti-protégé gagne son duel à 1,5 contre 1 sur des Pavois en marche, mais le perd de peu sur des Pavois ancrés (27,8 s contre 25 s). Il lui faut donc un appui de face, ou bien le Démontage doit s'étendre à l'ancrage ★.

Coût d'une rupture, reconstitution d'un cran comprise : 12 pour un Cortège, 20 pour des Piquets, 22 pour une Patrouille, 27 pour une Compagnie. L'écart reste voisin de 1 à 2 ; à surveiller, car une perte fixe par rupture serait un multiplicateur caché contre les petites escouades.

### 6.2 Les trois confrontations

**Convergence – Bastion : le réseau contre le front.** Le réseau refuse le front ; le Bastion cherche une poussée unique sur les relais puis sur le QG.
- *Abus possible à gauche* : nuée de Furets sur les dépôts. *Réponse* : une escouade de garde par dépôt, que le raid doit faire rompre (E5) ; le harcèlement ne prend pas un objectif tenu par des Piquets ancrés.
- *Abus possible à droite* : colonne Pavois et Béliers droit sur le QG vers 7 ou 8 minutes. *Réponses* : Démonteurs, Fanfare en rue sur des unités qui doivent lever l'ancrage pour s'écarter, renforts sortant au relais du QG, règle des 60 s d'occupation.

**Convergence – Préfecture : le nombre contre la rafale.** La Préfecture domine dans son secteur tant qu'elle a ses dotations ; la Convergence gagne en frappant ailleurs et en faisant tirer les salves dans le vide.
- *Abus possible à gauche* : Chaînes en masse sur deux objectifs. *Réponses* : Salve puis Interpellation sur des escouades immobiles ; Canon à eau.
- *Abus possible côté police* : Motards en nombre sur les dépôts. *Réponse* : une garde par dépôt ; les Motards, à 50 de cohésion, ne font rompre personne seuls. PC et Compagnies sur l'objectif central : cela ne tient qu'un objectif, donc ne marque que si l'adversaire n'en tient aucun.

**Bastion – Préfecture : l'endurance contre la fraîcheur.** C'est l'affrontement le plus fragile : deux camps lents, risque de score gelé. Ce qui doit le débloquer est l'endurance asymétrique : une position policière fraîche bat une Poussée ; après deux salves par Compagnie, elle la perd. Le Bastion encaisse l'ouverture puis pousse ; la police tourne ou décroche.
- *Abus possible côté police* : Canon à eau et Compagnies en rue. *Réponses* : Béliers, et la règle de carte des trois approches dont une avenue.
- *Abus possible à droite* : murer un objectif avec des Pavois. *Réponses* : Salve sur ce qui est ancré, Groupe d'intervention, Canon à eau qui fait lever l'ancrage, contournement par les Motards.

### 6.3 Les trois miroirs

- **Convergence.** Risque : chassé-croisé de captures sans combat. Réponses : capture en deux temps, Chaîne qui avantage le tenant, chasse aux relais par les Vigies.
- **Bastion.** Risque : front contre front, le premier qui attaque perd. Les brise-lignes sont la Poussée, qui fait lever l'ancrage adverse, puis l'Enfoncement et le duel de Frondeurs. Si le blocage persiste, raccourcir la recharge de la Poussée plutôt que d'introduire un multiplicateur propre au miroir.
- **Préfecture.** Risque : guerre froide, celui qui dépense ses dotations le premier perd. Le PC adverse est la cible décisive, et il tombe par simple occupation. C'est le miroir le plus exposé à l'ennui : y mesurer d'abord le temps sans commande.

### 6.4 Les trois abus que vous nommez

| Abus | Ce qui le borne | Nature de la borne |
|---|---|---|
| La police immobilise tout | Deux dotations par escouade, rechargées seulement dans un secteur ; un seul PC hors branche Intervention, qui tombe par occupation ; contrôle de 3 s puis 8 s d'immunité ; tout est annoncé | Budget et espace |
| La Convergence couvre la carte gratuitement | Propriété persistante des objectifs ; relais plafonnés, à 3 points de population chacun (9 points, 12 avec la branche Kiosque) ; un seul Camion-sono, soumis aux mêmes règles à l'arrêt ; aucun relais actif à moins de 25 m d'un objectif ; une arrivée par relais toutes les 30 s, révélée ; le repli ne traverse pas les lignes ; garder ou geler exige d'être à l'arrêt ou au contact | Budget et espace |
| Le Bastion regroupe toute son armée | Largeur de rue : la troisième escouade n'ajoute aucune pression ; flanc à × 1,5 ; aucun bonus entre voisines ; une masse unique ne tient qu'un objectif, et ne marque que si l'adversaire n'en tient aucun | Espace et score |

Aucune de ces bornes n'est un multiplicateur caché. Aucune n'est éprouvée.

### 6.5 Premiers paramètres de réglage — tous provisoires

| Paramètre | Départ | Plage à explorer | Ce qu'on observe |
|---|---|---|---|
| Rupture à coût égal, de face | 15 à 25 s | cible | Fenêtre de repli |
| Élimination d'une escouade restée au contact | 30 à 40 s : la rupture, puis 14 s par construction de R1 | cible | Valeur du repli volontaire |
| Durée de la rupture | 6 s | 3 à 8 s | Temps subi |
| Perte au contact, rompue et à l'arrêt | 1 cran à 3 s et à 6 s | 2 à 5 s | Létalité de l'encerclement |
| Arrêt requis pour garder ou geler ; rayon d'un objectif | 3 s ; 10 m | 2 à 5 s ; 8 à 15 m | Gardes au rabais par les éclaireurs |
| Récupération hors pression : délai, débit | 3 s, +8 par seconde | 3 à 6 s, +3 à +8 | Ruptures de face obtenues malgré la relève |
| Coût d'une rupture par camp | 12, 20, 22 | écart de 1 à 2 au plus | Usure comparée des trois camps |
| Multiplicateur de flanc | × 1,5 | × 1,3 à × 2 | Valeur du contournement |
| Contrôle maximal, immunité | 3 s, 8 s | 1,5 à 3 s, 8 à 15 s | Chaînes de contrôle |
| Score visé, taux par phase | 600 ; 0,5 / 1 / 2 | 500 à 700 | Durée médiane, retournements |
| Rendement d'une équipe | 30 Moyens ou 30 Équipement par minute | 20 à 40 | Minute du palier 2 ; excédent de Moyens |
| Production d'une escouade de palier 1 | 30 s ; Cortège 24 s | 20 à 40 s | Minute où le plafond de population est atteint ; nombre d'escouades par camp |
| Population maximale, escouades | 50, 16 | 40 à 60, 12 à 16 | Lisibilité, charge de contrôle |
| Relais : coût, plafond, population | 75, 3 (4 avec Kiosque), 3 | 50 à 125, 3 à 5, 2 à 4 | Couverture de carte |
| Transit : durée, recharge | 10 s, 30 s | 6 à 15 s, 15 à 45 s | Échanges de bases |
| Ancrage : pose, levée, réduction de face | 3 s, 2 s, −40 % | 2 à 5 s, 1 à 3 s, −25 à −50 % | Rythme des bonds |
| Secteur : rayon, déploiement, repli | 30 m, 12 s, 8 s | 20 à 40 m, 8 à 20 s, 5 à 12 s | Rotation de la police |
| Dotations : charges, recharge | 2, 20 s | 2 à 3, 15 à 30 s | Durée de la supériorité locale |
| Efficacité d'un contre à coût égal | 1,5 à 1,8 | cible | Unités peu utilisées |

**Ordre de réglage** : d'abord les durées (transit, ancrage, déploiement, rupture), qui font le ressenti ; puis les coûts ; puis les pressions. Une variable à la fois, par pas d'au moins 20 %.

### 6.6 Seuils de validation

Ils se mesurent sur des parties **entre humains** : dix par affrontement pour une première lecture, trente avant toute affirmation d'équilibre. Elles se jouent par le lien réseau de l'essai B2, gardé comme outil de test. Contre l'IA, ces seuils ne sont relevés qu'à titre indicatif.

- durée médiane entre 12 et 20 minutes ;
- temps de score gelé inférieur à 20 % ;
- le vainqueur du premier engagement gagne moins de 60 % des parties ;
- 10 à 25 % de victoires par le QG ; aucune faction au-delà de 70 % par la même condition ;
- au moins 40 % des ruptures précédées d'un ordre du joueur ;
- moins de 10 % du temps d'engagement passé sous contrôle ;
- moins de 5 % du temps de jeu après 1:00 passé dans des intervalles de plus de 20 s sans commande émise ;
- aucune unité présente dans moins de 5 % des parties.

Un taux de victoire proche de 50 % ne valide rien si l'un de ces seuils est manqué. Les parties IA contre IA mesurent l'IA, pas l'équilibre : elles servent à détecter régressions, blocages et durées aberrantes.

---

## 7. Partie exemple : les dix premières minutes

La Convergence (le joueur, à l'ouest) contre le Bastion. Objectifs Nord, Centre et Sud. Les minutages suivent les distances, vitesses, durées et coûts de ce document ; c'est une illustration de la boucle, pas d'un équilibre.

- **0:00.** Deux équipes et des Vigies en production. Les deux Cortèges partent, l'un au Nord, l'autre au Centre. Une équipe part poser le relais offert dans une cour entre le Nord et le Centre, à 40 m du Centre.
- **0:32 — reconnaissance.** Sorties à 0:12, les Vigies croisent deux Piquets en marche vers le Centre. **Adaptation** : à un contre deux, le Cortège du Centre perdrait ; il bifurque vers le Sud.
- **0:45 à 0:52.** Le Nord est à la Convergence. Les Lévriers adverses ont pris le Sud à 0:44 ; les Piquets prennent le Centre à 0:51 et s'ancrent. Les Vigies atteignent la base adverse : pas d'expansion, un troisième Piquets en production, une équipe en route pour bâtir le cantonnement vers le Centre. Lecture : pression de palier 1, pas d'Équipement avant longtemps.
- **0:59 à 1:25.** Le Cortège arrive au Sud, fait rompre les Lévriers en 12,5 s, neutralise puis prend. Nord et Sud à la Convergence, Centre au Bastion.
- **1:02 — décision difficile n° 1.** 200 Moyens en caisse. Deux Cortèges de plus garantiraient Nord et Sud contre la poussée qui vient. L'expansion (200 Moyens, ouverte à 1:22) donne l'Équipement vers 2:00 et le palier 2 avant l'adversaire, au prix de deux minutes minces. Le joueur prend l'expansion : l'armée du Bastion est lente, et le relais permet de céder un lieu sans le perdre pour de bon.
- **2:00.** Le score s'ouvre : +0,5 point par seconde à la Convergence. Un troisième Cortège sort au relais à 2:14, un quatrième à 2:44.
- **2:45.** Les Vigies voient trois Piquets quitter le Centre vers le Nord, en colonne. Le Centre n'est gardé que par les Lévriers.
- **3:03 — décision difficile n° 2.** Tenir le Nord en Chaîne : face à deux Piquets de front dans une rue, la rupture vient en une quinzaine de secondes, puis les pertes. Ou céder le Nord et prendre le Centre vidé. Le joueur ordonne le repli du Cortège du Nord vers le relais, et envoie les deux Cortèges du relais sur le Centre.
- **3:15 à 3:35.** Le Bastion neutralise le Nord à 3:20 et le prend à 3:30. Les Lévriers rompent à 3:21, le Centre est neutralisé à 3:28 et pris à 3:35. Bilan : Centre et Sud contre Nord, toujours un objectif d'écart pour la Convergence, et l'armée du Bastion se trouve au nord, loin de son cantonnement. Le front a gagné un lieu et perdu la carte. Score : 41 à 0.
- **3:40.** 100 Équipement en caisse : palier 2 lancé, fini à 4:20.
- **4:15 — reconnaissance.** Les Vigies voient l'expansion du Bastion et deux Pavois, l'un sorti, l'autre en production. **Adaptation** : il faudra ouvrir une ligne protégée ; branche Atelier pour les Démonteurs plutôt que Kiosque, lancée à 4:30.
- **5:20 à 6:00.** Le Bastion revient au Centre avec deux Pavois et deux Piquets, par bonds : ancrage, poussée, ancrage. Il a laissé un Piquets au Nord. Les deux Cortèges reculent, l'un rompt et perd un cran, tous deux se replient au relais et s'y reconstituent. Le Centre est neutralisé à 5:50, pris à 6:00. Score : 108 à 0, et le Bastion marque à son tour.
- **6:05 à 6:35.** Les Démonteurs sortent au relais, des Furets suivent à 6:35, puisqu'un relais ne reçoit qu'une escouade toutes les 30 s. Contre-attaque : Démonteurs et Cortège de face, les portes des Pavois sont arrachées ; les Furets prennent le passe-cour et tombent dans le dos des Piquets ancrés, dont la face est fixée.
- **6:40 — reconnaissance.** Une Charpente est en construction chez l'adversaire : des Béliers viendront. **Adaptation** : garder les Furets pour eux, et ne plus compter sur un relais proche du front, qu'une ruée ferait tomber.
- **7:05 à 7:12.** Le Centre est neutralisé puis repris. Score : 108 à 32.
- **8:00.** Phase 2, le taux double. Score : 132 à 32.
- **9:15 à 9:40.** Les Béliers arrivent au front. Enfoncement annoncé sur le Cortège en Chaîne, Poussée derrière : le Centre est neutralisé à 9:30 et repris par le Bastion à 9:40.
- **10:00.** Score : 222 à 52. Le Bastion marque un point par seconde, et à 14:00 le taux doublera encore : un seul objectif d'écart vaudra 120 points par minute. Rien n'est joué.

---

## 8. Faisabilité

### 8.1 Décision

**Tout se fait dans Unreal Engine : votre décision du 11 novembre 2026.** Un seul outil, un seul projet. Ce qui suit vise à ce que ce choix se passe bien.

**La simulation est un module C++ du projet Unreal, sans aucune classe de jeu du moteur, ni acteur ni objet Unreal, conçu pour être déterministe. Le reste du projet n'affiche que ses instantanés.** Le déterminisme reste une hypothèse tant qu'il n'est pas mesuré.

Trois règles de travail en découlent :

1. Aucune règle de jeu dans un Blueprint ni dans un acteur. Règles, IA et données vivent dans le module et dans des fichiers texte. C'est aussi ce qui me permet de les écrire : je modifie du C++ et des fichiers de données, pas des Blueprints, qui sont des fichiers binaires [U9].
2. Le module se teste sans lancer le jeu, par l'éditeur en ligne de commande, sans affichage [U11].
3. Le reste du projet ne fait que trois choses : transformer les entrées en commandes, afficher les instantanés, jouer sons et animations.

**État de votre machine, relevé le 11 novembre 2026**

- MacBook Air M5, 24 Go, macOS 27.2.1.
- Unreal Engine 5.8.4, mis à jour ce jour depuis la 5.8.0.
- Xcode 27.2.

**Compilation C++.** Avec la 5.8.0, l'outil de compilation d'Unreal refusait Xcode 27.2 : ce moteur n'admettait Xcode que jusqu'à la version 26.9, d'après son fichier `Engine/Config/Apple/Apple_SDK.json`. Le correctif 5.8.4 porte cette limite à 27.9, et l'outil déclare maintenant la plateforme Mac valide. L'annonce du correctif ne le mentionnait pas [U1]. Le projet a été créé et compilé le même jour : deux modules C++ vides, `PointDeRupture` et `PdrSim`, compilés et liés avec Xcode 27.2 en 74 secondes, sans erreur ni avertissement. Lancé sans interface, l'éditeur les charge tous les deux, le module de jeu appelant celui de simulation, et exécute un script Python ; ce premier chargement a pris 3 min 47 s.

**Écoutes réseau d'Unreal.** Sans réglage, Unreal ouvre des ports sur toutes les interfaces réseau du Mac, à la compilation comme à l'exécution. Le projet n'a besoin d'aucun. Relevé des 11 et 12 novembre 2026, par la liste des ports en écoute pendant chaque commande :

| Qui écoute | Port | Quand | Ce qui est fait pour ce projet |
|---|---|---|---|
| L'outil de compilation, pour accepter des machines d'appoint | 1345 | Pendant chaque compilation | Coupé par `Saved/UnrealBuildTool/BuildConfiguration.xml` (réglage `bDisableRemote`). Le dossier `Saved` n'est pas versionné, ce fichier l'est par exception |
| Le serveur de traces `UnrealTraceServer`, programme de fond lancé à chaque démarrage du moteur | 1981 et 1989 | Du démarrage du moteur à l'arrêt du serveur, qui lui survit. Lancé le 11 novembre à 23 h 20 par une vérification, il écoutait encore le lendemain à 7 h 24 | Les commandes du projet passent `-notraceserver` : il n'est plus lancé |
| Le moteur lui-même, pour la commande à distance de ses traces | 1985 | Tant que le moteur tourne | Les commandes sans affichage passent `-notracethreading`. Avec l'interface de l'éditeur, ce port ne se ferme pas sur un moteur installé : c'est une option de compilation du moteur |
| Le serveur de stockage local `zenserver` | 8558 | Tant que le moteur tourne, et quelques secondes après | Limité à la machine elle-même par `Config/DefaultEngine.ini` (`RemoteNetworkService=None` ; valeur par défaut du moteur : `GeneratedStaticKey`) |

Vérifié le 12 novembre 2026 : pendant une compilation puis une exécution sans affichage, aucun processus d'Unreal n'écoute ailleurs que sur la machine elle-même. Le script de vérification (section 9) refait ce relevé à chaque passage et échoue si une écoute apparaît. Je l'ai éprouvé en retirant `-notracethreading` : il signale le port 1985.

Deux limites. L'éditeur lancé avec son interface n'est pas couvert : il n'a pas encore été ouvert sur ce projet, ses écoutes sont à relever avant de s'en servir (vue de mise au point de A1), et il faudra le lancer avec `-notraceserver`. Vos autres projets Unreal gardent le comportement par défaut ; le dossier `~/UnrealEngine/UnrealTrace` porte des journaux du serveur de traces datés d'octobre, antérieurs à ce projet.

### 8.2 Ce que disent les sources, et ce qu'on en fait

Pages lues le 11 novembre 2026, puis relues par un second lecteur chargé de réfuter ; cinq d'entre elles ont été rouvertes une troisième fois. **Seule la colonne « Fait » est établie par la source citée. La colonne « Ce qu'on en fait » est mon jugement.**

| Fait | Ce qu'on en fait | Source |
|---|---|---|
| Dernière version stable : 5.8, de juin 2026, correctif 5.8.4 du 20 octobre 2026. En juin 2026, Epic ne prévoyait pas d'autre version d'UE5 tout en se réservant une 5.9 ; une 5.9 Preview, dite instable, est parue le 9 novembre 2026. UE6 : accès anticipé visé fin 2027, version complète 12 à 18 mois plus tard ; acteurs et Blueprints présents au début, puis abandonnés avec des outils de conversion | Vous êtes sur le correctif 5.8.4. Une V1 livrée avant 2029 peut rester sur UE5 ; ne planifier aucun passage à UE6 avant elle. La règle « aucune règle de jeu en Blueprint » protège aussi de cet abandon | [U1] [U2] |
| Éditeur 5.8 sur Mac : la page des prérequis donne macOS 14.5 et Xcode 26.0 au minimum et dit Xcode 26.4 incompatible ; la section macOS des notes de version 5.8 donne macOS 14.0 et Xcode 15.2 ; aucune page ne dit laquelle fait foi. Processeur M3 et 32 Go recommandés, 16 Go au minimum | Votre Mac, un M5 à 24 Go, dépasse le minimum et reste sous la mémoire recommandée. Votre Xcode 27.2 est admis depuis le correctif 5.8.4 (8.1). Figer désormais les versions de Xcode et de macOS : c'est leur mise à jour qui avait bloqué la compilation | [U3] [U12] |
| Sur Mac, Nanite et les Virtual Shadow Maps sont en « Beta support » à partir de M2, Lumen logiciel fonctionne dès M1, Lumen matériel est expérimental | Sans conséquence pour de la 3D stylisée vue de dessus : s'en tenir aux fonctions stables et à un éclairage simple | [U3] |
| La compilation croisée vers Linux n'est prise en charge que depuis Windows ; un Mac doit compiler nativement | Les exécutables Windows et Linux se produisent sur une machine Windows, prérequis de l'étape C seulement. Jusque-là, tout se fait sur le Mac | [U4] |
| Les fichiers `.uasset` et `.umap` sont binaires : ils ne s'ouvrent pas comme du texte et ne se fusionnent pas dans un outil textuel ; l'éditeur verrouille par extraction et propose une comparaison avec le dépôt | Garder en texte tout ce qui change souvent : règles et IA en C++, unités et cartes en fichiers de données. Le niveau Unreal est généré à partir de la carte en données. Un agent de programmation ne peut pas modifier un Blueprint ou un niveau comme du texte : ne rien y mettre qu'il doive toucher | [U9] |
| Intégrations de contrôle de version prises en charge : Perforce, Git avec Git LFS, Subversion, Diversion ; Epic utilise surtout Perforce ; le plugin Git de l'éditeur est en bêta | Git avec LFS et verrouillage des fichiers binaires suffit à cette échelle | [U13] |
| One File Per Actor : un fichier externe par acteur, dans l'éditeur seulement | L'activer, pour que deux retouches d'un niveau ne se heurtent pas dans un seul fichier | [U14] |
| Python dans l'éditeur : fonctionnalité marquée expérimentale, disponible dans l'éditeur seulement, pas comme langage de jeu à ce jour ; un script peut se lancer sans interface | L'employer pour générer le niveau depuis la carte en données et pour fabriquer les modèles (8.9), jamais pour le jeu | [U15] |
| Les plugins MassGameplay, MassAI et MassCrowd portent la mention Experimental en 5.8, AnimToTexture aussi. L'Animation Budget Allocator, sans mention de statut, bride le rythme d'animation des maillages squelettiques | Ne bâtir ni la foule ni l'IA sur Mass. Pour 150 à 260 personnages cosmétiques : maillages squelettiques classiques, niveaux de détail, Animation Budget Allocator | [U5] [U16] |
| L'évitement RVO est limité à la classe Character. Le réseau est client-serveur à serveur autoritaire. La physique asynchrone « améliore » le déterminisme sans le garantir, et le pas fixe asynchrone est marqué expérimental | La simulation n'utilise ni la navigation, ni le réseau, ni la physique du moteur ; la navigation d'Unreal ne sert qu'au placement cosmétique des membres. Votre mise en garde sur le pas fixe est fondée | [U6] [U7] [U8] |
| Le rendu nul (`-nullrhi`) est documenté ; le cadre d'automatisation est dit peu adapté au test unitaire pur | Tests de règles par l'éditeur en ligne de commande, sans affichage : c'est ce que fait l'exécuteur depuis le 11 novembre 2026 (section 9). Pour le test unitaire pur, Epic renvoie à ses « Low-Level Tests », dont je n'ai pas pu lire la page ; ils ne sont pas essayés, le démarrage du moteur à chaque lancement restant supportable : la commande de vérification complète prend 11 secondes, démarrage compris (8.3) | [U11] |
| Redevance de 5 % au-delà d'un million de dollars de revenu brut sur la vie du produit | Sans effet avant un succès commercial | [U10] |

**Techniques et précédents**

- Le lockstep déterministe (mêmes commandes, même simulation sur chaque machine, tours de l'ordre de 200 ms) est décrit par ses auteurs pour Age of Empires ; ils rapportent que 250 ms de latence d'ordre n'étaient pas remarqués par les joueurs [T1].
- Le déterminisme en virgule flottante entre compilateurs et architectures est possible mais fragile [T2] [T3] ; l'auteur de Box2D l'obtient entre x64 et ARM en désactivant notamment la multiplication-addition fusionnée [T4].
- Le manuel de Dawn of War, dans son édition combinée de 2006, décrit un moral d'escouade entamé par les mêmes armes que la santé : rompue, l'escouade fait très peu de dégâts, gagne de la vitesse, et le joueur n'en perd pas le contrôle [T7]. C'est le précédent de l'état rompu de R1 seulement ; la séparation entre pression et effectif n'a pas de précédent sourcé ici.
- Le studio de Stormgate a annoncé un réseau à rollback, puis désactivé ses modes en ligne en avril 2026 après l'arrêt de son prestataire de serveurs [T6]. J'y lis un argument pour ne pas faire dépendre la partie de base d'un service tiers.

### 8.3 Ce qui reste hypothèse

- **Exécutable Windows depuis un Mac.** Aucune page actuelle ne dit que c'est possible ; compter sur une machine Windows.
- **Vitesse d'itération.** Mesurée sur le Mac de référence, sans interface. Le 11 novembre 2026 : première compilation des deux modules vides, 74 s ; premier chargement du projet, 3 min 47 s. Le 12 novembre 2026, cinq relevés par mesure, minimum puis médiane : recompilation après retouche d'un fichier du noyau, 2,3 s et 2,5 s ; d'un en-tête du noyau, 5,1 s et 5,5 s ; du fichier de tests, 5,8 s et 5,9 s ; commande de vérification complète (démarrage du moteur, 420 vérifications, mesures de charge, cent parties jouées puis rejouées), 10,9 s et 11,0 s, dont 0,22 s pour les vérifications. Le chargement de l'éditeur complet, avec son interface, n'est pas mesuré. Un piège relevé au passage : l'outil de compilation d'Unreal ne recompile pas un fichier source retouché moins d'une seconde après la production de son objet. Le script de vérification le détecte, rafraîchit la date du fichier et recompile.
- **Fabrication de modèles par script.** Geometry Script s'appelle depuis Python [U20], mais je n'ai pas vérifié qu'un maillage ainsi produit s'enregistre comme actif par script. À essayer en A1.
- **Virgule fixe et entiers.** Aucune source lue ne porte sur ce point ; c'est une pratique que je tiens pour établie, pas un fait vérifié. Que le même module donne les mêmes résultats sur un autre système que le Mac ne sera vérifié qu'à l'essai réseau de B2.
- **Reciblage d'animations.** Unreal fournit IK Rig et IK Retargeter [U19] ; ce qu'ils donnent sur des animations gratuites n'est pas mesuré. L'essai 3D de B2 le dira.
- **Performance** : jusqu'à une trentaine d'escouades et de véhicules et une trentaine d'équipes logistiques simulés, 150 à 260 personnages animés à l'écran sur le Mac de référence. Aucun chiffre officiel de charge n'existe ; à mesurer à l'essai 3D de B2.
- **Acceptation du thème par les boutiques et classification par âge** : non vérifiées.

### 8.4 Architecture

**Modules**

- `sim` : module C++ du projet Unreal. État, itération, économie, déplacement, visibilité, combat, cohésion, objectifs, sérialisation, empreinte d'état. Aucune classe de jeu du moteur. Aucun flottant, y compris à la lecture des données : les décimaux sont convertis en entiers par un analyseur propre (unités : dix-millième de point de cohésion, millimètre, itération ; arrondi vers zéro). Aucun parcours de collection non ordonnée, aucune lecture d'horloge.
- `donnees` : fichiers texte pour unités, capacités, technologies, bâtiments, cartes ; schéma et validateur exécutés à chaque modification. Un outil d'éditeur génère le niveau Unreal à partir de la carte en données : la carte reste lisible et modifiable hors de l'éditeur. Les capacités sont composées de primitives d'effet (zone retardée, cône, recul, canalisation), sans langage de script en V1.
- `ia` : ne dépend que de la vue du joueur et de l'interface d'ordres.
- `executeur` : commande de l'éditeur lancée sans affichage ; parties simulées, relectures, mesures.
- `presentation` : le projet Unreal. Rendu, animation, effets, son, caméra. Lecture seule, aucune règle de jeu.
- `interface` : dans Unreal, transforme les entrées en commandes ; sa logique est en C++, les Blueprints ne servent qu'à la mise en page.
- `reseau`, à partir de B2 : transport des commandes, ordonnancement, comparaison d'empreintes.

Dans le projet, `sim` est le module `PdrSim`, qui ne dépend que du module `Core` du moteur ; `executeur` est le module d'éditeur `PdrOutils`, qui porte aussi les tests et se lance par `-run=PdrSim`. Le dossier `Outils` contient le modèle Python indépendant d'où viennent les valeurs de référence des tests (`Outils/modele/modele_a1.py`) et le script qui enchaîne contrôle des sources, compilation, tests et relectures (`Outils/verifier.py`).

**Frontières.** Une seule entrée : des commandes sérialisables (joueur, itération cible, type, paramètres). Deux sorties : événements et instantanés. La vue du joueur, filtrée par le brouillard, est servie à l'identique à l'interface et à l'IA : l'IA ne peut pas tricher par accident.

**Boucle à 20 Hz** (hypothèse) : commandes de l'itération, triées ; économie et production ; visibilité ; ordres des escouades ; déplacement et réservations ; pression, cohésion, effectif ; effets temporisés ; objectifs et score ; événements ; empreinte toutes les 100 itérations. La présentation interpole entre deux instantanés et accuse réception d'un ordre tout de suite (son, marqueur), sans attendre l'itération.

**Sauvegarde** : instantané sérialisé portant la version du schéma et l'empreinte des données. **Relecture** : configuration initiale, journal des commandes, empreintes périodiques.

### 8.5 Navigation : le premier risque technique

**Décision : l'escouade est la seule entité simulée.** Ses membres sont cosmétiques : ils suivent des emplacements de formation, et leur nombre visible dérive de l'effectif.

| Approche | Forces | Risques | Verdict |
|---|---|---|---|
| Maillage de navigation et évitement par agent | Disponible tout de suite, mouvement fluide | Bouchons et face-à-face bloqués en rue étroite ; flottants ; cohésion d'escouade à ajouter | Pour les membres cosmétiques seulement |
| Champs de flux [T5] | Excellents pour des centaines d'unités vers une même cible | Surdimensionnés pour trente escouades ; ne règlent ni la formation ni le croisement | Écarté |
| **Grille à réservation, à l'échelle de l'escouade** | Entière et déterministe ; la capacité d'une rue devient une règle lisible (R2) ; une barricade est une arête fermée | Mouvement raide si la présentation est pauvre | **Retenu, à prototyper d'abord** |

Hypothèses de départ : cellules d'un mètre, empreinte d'escouade de 3 × 3. Les voies sont découpées en **files** de 3 cellules de large : passage, 1 file ; rue, 2 files ; avenue, 4 files. Une escouade arrêtée, ancrée ou au contact occupe toujours une file entière. Deux escouades sont adjacentes, au sens de R2, quand leurs empreintes partagent un bord d'au moins une cellule. Recherche de chemin avec carte de dégagement, réservation des cellules devant l'escouade. Les véhicules roulent sur un sous-graphe de voies carrossables et tournent sur place ; les Motards sont simulés comme une infanterie rapide.

Repli si le mouvement est jugé raide après lissage : un graphe de rues à capacités avec positions continues en virgule fixe. Pas le maillage par agent.

### 8.6 Déterminisme et réseau

**Décision prise maintenant** : arithmétique entière et virgule fixe, pas fixe, ordre d'itération stable, aléa à graine, commandes horodatées comme seule entrée. Le bénéfice est immédiat en solo : relectures, tests de non-régression, bogues reproductibles.

| Modèle | Ce qu'il impose | Verdict à cette échelle |
|---|---|---|
| Lockstep déterministe | Simulation identique au bit près sur Mac ARM, Windows x64 et Linux x64 | **Retenu sous réserve de l'essai de B2**, premier moment où deux systèmes sont comparés ; son coût est engagé dès A1 par les relectures et les tests |
| Serveur ou hôte autoritaire, réplication d'état : le modèle natif d'Unreal [U7] | Aucun déterminisme ; un hôte ; relectures à construire à part | Solution de repli, ouverte tant que la présentation ne lit que des instantanés |
| Rollback | Déterminisme, plus sauvegarde, restauration et resimulation à chaque image | Écarté, par jugement : selon [T1], 250 ms de latence d'ordre passaient inaperçus dans Age of Empires. À revérifier à l'essai réseau de B2 |

Limite connue du lockstep : chaque machine possède tout l'état, donc la triche au brouillard est possible. Acceptable hors compétition classée. L'essai réseau a lieu en B2, avant toute production de contenu importante ; son lien direct, sans service tiers, sert ensuite aux parties de test entre humains.

### 8.7 IA

Trois couches, toutes en données. **Stratégique** : ordres de construction scriptés et règles de bascule sur reconnaissance. **Opérationnelle** : carte d'influence, affectation de groupes aux objectifs, garde des dépôts. **Tactique** : seuils de relève et de repli, usage des capacités, réponse aux zones annoncées. L'IA lit la même vue filtrée que l'interface et émet les mêmes commandes, avec un plafond d'ordres par minute.

V1 : deux tempéraments par faction (pression, développement), trois niveaux ; le niveau haut reçoit une aide économique affichée. Le coût réel tient aux six affrontements et aux trois signatures : une faction dont l'IA joue mal la mécanique paraît faible. Ordre de grandeur sous les hypothèses d'équipe de la section 9 : quatre à six mois-personne, puis un entretien à chaque changement d'équilibrage.

### 8.8 Coûts de production cachés

- **Animation.** 27 types d'unités dans le plan d'origine. Avec un squelette commun, un tronc de locomotion par faction et cinq clips propres par type : environ 160 clips, soit 4 à 12 mois-personne pour un animateur. Vous avez écarté cette voie : la V1 s'appuie sur le mannequin d'Unreal, des animations gratuites et des accessoires générés (8.9). Cela borne la qualité visuelle et supprime ce poste.
- **Véhicules.** Une seconde navigation. V1 : quatre véhicules, tous sur voies carrossables, sans transport.
- **Interface.** Compter 20 à 30 % de l'effort de programmation.
- **Son.** Pas de voix intelligibles en V1 : sifflets, slogans indistincts, radio brouillée. Cela sert le thème et supprime le doublage.
- **Tutoriel.** Écrit en dernier, en scénarios scriptés sur l'interface d'ordres, pour une faction ; une fiche par mécanique pour les deux autres.
- **Budgets utiles.** Vitesse de l'exécuteur sans affichage ; durée du cycle modification-essai (cible : moins de 10 s pour une valeur de données, moins de 60 s pour une règle ; mesuré en A1 pour une règle : 13 à 17 s, somme d'une recompilation et de la commande de vérification complète, lancées en ligne de commande et non dans l'éditeur ouvert (8.3) ; rien n'est mesuré pour une valeur de données, faute de fichiers de données à ce stade) ; accusé de réception d'un ordre, son et marqueur, en 100 ms au plus, en solo comme en réseau ; premier mouvement visible en 100 ms au plus en solo, auxquels s'ajoute en réseau le délai d'ordre du lockstep (hypothèse : 2 à 5 itérations, soit 100 à 250 ms, à mesurer en B2).

### 8.9 Personnages et modèles : contenus gratuits d'Unreal et modèles générés

Vos décisions du 11 novembre 2026 : tout dans Unreal, ni achat ni sous-traitance. Les modèles viennent de ce qu'Unreal fournit gratuitement, ou je les fabrique. Les pages citées ici n'ont été lues qu'une fois, sans contre-lecture.

**Ce qu'Unreal fournit**

| Fait | Ce qu'on en fait | Source |
|---|---|---|
| Le modèle de projet « Third Person » fournit deux mannequins, Quinn et Manny, avec leurs animations | C'est le squelette commun de toutes les unités à pied | [U17] |
| Le « Game Animation Sample Project », à télécharger sur Fab, contient plusieurs personnages et des animations de locomotion ; sa page dit qu'on peut en migrer les animations et les systèmes dans son propre projet | Source du tronc de locomotion. La page ne dit ni son prix ni sa licence : à lire par vous au téléchargement | [U18] |
| IK Rig et IK Retargeter reciblent des animations d'un squelette vers un autre | Pour adapter au mannequin toute autre animation gratuite | [U19] |
| Geometry Script, plugin en bêta, génère et modifie des maillages depuis Python et les Blueprints | L'outil avec lequel je fabrique accessoires, mobilier et bâtiments, piloté par des scripts Python de l'éditeur [U15] | [U20] |
| L'import d'Unreal, Interchange, se pilote en Blueprint ou en Python | Seconde voie : j'écris des fichiers de maillage et un script les importe | [U21] |
| Le « City Sample » recommande Windows 10, 64 Go de mémoire et une carte graphique de la classe RTX 2080 ; il repose sur des fonctions dites expérimentales, et son générateur de bâtiments demande une licence Houdini | À écarter sur un MacBook Air à 24 Go | [U22] |

**Ce que je peux fabriquer**, par script, dans Unreal : l'accessoire géant de chaque unité (banderole, portes, madrier, instruments, boucliers), le mobilier urbain et les barricades, les immeubles tronqués et l'habillage simple des cartes, des véhicules en volumes géométriques, les marqueurs de zone et d'objectif, les icônes de l'interface. Le résultat sera stylisé et géométrique.

**Ce que je ne peux pas fabriquer** : des personnages sculptés, des visages expressifs, des animations sur mesure de la qualité d'un animateur. Les gestes propres aux unités seront adaptés d'animations existantes. Ceux qu'aucune animation gratuite ne couvre seront listés à l'essai 3D de B2, puis simplifiés ou abandonnés.

**Ce que cela fixe**

- **Une unité = le mannequin, la couleur et le motif de son camp, un accessoire.** C'est la règle « un nom, un objet, un geste » poussée au bout : la silhouette vient de l'objet, pas du corps.
- **Le registre.** Le burlesque stylisé est à portée de cette méthode ; le réalisme tendu ne l'est pas.
- **Les téléchargements et les licences restent à vous.** C'est votre compte Epic, et c'est vous qui acceptez la licence de chaque contenu. Je n'ai lu que le résumé de la licence de Fab [F1] ; la page de la licence de contenu d'Epic m'a refusé l'accès.
- **Le son suit la même règle** : contenus gratuits d'Unreal ou sons de synthèse simples que je génère (sifflets, percussions, brouhaha), sans voix.
- **Une inconnue reste à lever en A1** : qu'un maillage généré par script s'enregistre bien comme actif. Les deux autres sont levées depuis le 11 novembre 2026 : un script Python de l'éditeur se lance sans interface sur ce Mac, et la compilation y passe (8.1).

---

## 9. Plan exécutable

Une étape n'est finie que si ses critères sont mesurés sur des parties réellement jouées. Aucune fonctionnalité n'est « terminée » hors d'une partie. Les mesures de vitesse se font sur votre MacBook Air M5 à 24 Go, machine de référence.

**Avancement au 12 novembre 2026.** Le noyau de l'étape A1 et son outillage sont écrits, testés et mesurés. La vue de mise au point et le premier accessoire généré ne sont pas commencés. Aucune règle du jeu n'existe : le noyau ne sait que créer des escouades, les déplacer en ligne droite et les retirer.

Ce qui existe :

- `PdrSim`, le noyau : état, boucle à pas fixe de 20 itérations par seconde, commandes appliquées dans un ordre canonique, aléa à graine, empreinte de l'état relevée toutes les 100 itérations, sauvegarde relue sous validation stricte, enregistrement et relecture des parties. Entiers seulement, longueurs en millimètres.
- `PdrOutils`, l'exécuteur sans affichage : 420 vérifications, mesures, génération et relecture de parties.
- `Outils/verifier.py` : en une commande, contrôle des sources (ASCII seulement ; ni flottant ni horloge dans le noyau), compilation, tests, cent relectures comparées à un condensé attendu, fraîcheur des binaires, écoutes réseau (8.1).
- Le dépôt Git du projet, poussé le 12 novembre 2026 sur GitHub en dépôt privé (`M4D135/point-de-rupture`). Git LFS n'est pas en place, faute de fichier binaire à ce jour ; il est à installer avant le premier actif Unreal [U13].

Critères de A1, mesurés le 12 novembre 2026 sur le Mac de référence ; pour les durées, cinq relevés, minimum puis médiane :

| Critère | Mesure |
|---|---|
| La plateforme Mac est déclarée valide et un projet C++ vide se compile | Tenu depuis le 11 novembre 2026 (8.1) |
| Cent relectures distinctes d'au moins 10 000 itérations donnent la même suite d'empreintes d'une exécution à l'autre | Tenu. Cent parties de 10 000 itérations, 337 010 commandes au total, cent états finaux distincts, cent relectures conformes. Le condensé de toutes leurs empreintes, `9565f56e1f910d8d`, est le même à chacune des plus de quinze exécutions du jour, y compris avec le projet compilé sans optimisation. Un modèle Python écrit à part l'avait calculé avant le C++, et il reproduit les cent fichiers de parties au caractère près |
| Boucle vide : 24 000 itérations en moins d'une seconde | Tenu : 0,06 ms |
| Suite de tests complète en moins de 60 s | Tenu : 0,22 s pour les 420 vérifications ; 10,9 s et 11,0 s pour la commande complète, démarrage du moteur compris |
| Durée du cycle modification-essai dans l'éditeur Unreal relevée | **Non tenu** : l'éditeur n'a pas été ouvert avec son interface. En ligne de commande, le cycle est de 13 à 17 s (8.3) |

Hors critères, pour situer la marge avant A3, qui demande 20 minutes de partie simulées en 6 s, soit 250 microsecondes par itération : 24 000 itérations avec 48, 200 et 4 096 escouades en marche prennent 24 ms, 99 ms et 2,04 s ; avec 4 096 escouades, 8 ordres par itération et l'enregistrement actif, une itération prend 55 microsecondes, soit 22 % de ce budget. Ces chiffres ne valent que pour le déplacement en ligne droite de A1 : ni navigation, ni combat, ni visibilité.

Limites connues :

- Deux motifs de refus d'une commande, « tardive » et « file pleine », dépendent de l'histoire locale de la machine. En réseau, ils feraient diverger deux machines : c'est à la couche réseau de B2 de les rendre impossibles.
- Une partie rechargée depuis une sauvegarde ne peut pas produire sa relecture : la sauvegarde reprend la simulation, pas le journal des commandes. À trancher en B1, avec la sauvegarde et la reprise.
- Le déplacement de A1 tronque chaque pas au millimètre sur chaque axe. La vitesse réelle dépend donc de la direction : elle reste sous la vitesse nominale de moins de 1,5 mm par itération, ce qui pèse jusqu'à 29 % aux vitesses de 1 et 2 mm par itération et moins de 1 % à 150. La navigation de A2 le remplace.
- Le modèle Python et le C++ ont le même auteur : leur accord contrôle l'écriture du code, pas le bien-fondé des règles.
- Le déterminisme n'est mesuré que sur ce Mac, avec un seul compilateur, à deux niveaux d'optimisation. L'essai entre deux systèmes reste celui de B2.

Reste à faire en A1 : la vue de mise au point du dessus ; le premier accessoire généré par script et enregistré comme actif ; le cycle modification-essai relevé dans l'éditeur, avec ses écoutes réseau (8.1) ; le schéma de données et son validateur.

| Étape | Livrables | Critères d'acceptation |
|---|---|---|
| **A1 — Noyau et outillage** | Projet Unreal en C++ qui se compile sur le Mac (8.1) ; module `sim` minimal, commandes, exécuteur sans affichage, relecture ; vue de mise au point du dessus ; un premier accessoire généré par script et enregistré comme actif | L'outil de compilation d'Unreal déclare la plateforme Mac valide et un projet C++ vide se compile. Cent relectures distinctes d'au moins 10 000 itérations donnent la même suite d'empreintes d'une exécution à l'autre sur le Mac. Boucle vide : 24 000 itérations en moins d'une seconde. Suite de tests complète en moins de 60 s. Durée du cycle modification-essai dans l'éditeur Unreal relevée sur le Mac de référence |
| **A2 — Navigation** | Grille, files, dégagement, réservation, repli, barricade. Six scénarios : file de six escouades devant un passage ; croisement de deux colonnes alliées de quatre escouades en rue ; face-à-face de deux colonnes ennemies en rue, blocage attendu ; repli à travers une colonne alliée ; barricade posée en cours de trajet ; carrefour à quatre flux | Sur 1 000 exécutions à graines variées : aucune escouade immobile plus de 3 s avec un ordre non satisfait, hors attente en file devant un passage et hors blocage voulu par R2, lesquels émettent un événement « en attente » ou « bloqué » en 2 itérations au plus ; temps de franchissement inférieur ou égal à 1,5 fois le temps de référence (longueur du plus court chemin divisée par la vitesse, plus, en file, la traversée des escouades qui précèdent) |
| **A3 — Prototype de plaisir** | Section 10 | Section 10. Partie de 20 minutes simulée en 6 s ou moins sur un cœur. Décision écrite : continuer, réviser ou arrêter |
| **B1 — Deux factions, boucle complète** | Convergence et Bastion, quatre unités chacune, relais et postures, économie, production, brouillard, score, IA scriptée, sauvegarde, une carte grise, interface minimale | 20 parties humaines contre l'IA enregistrées, durée médiane entre 12 et 20 minutes. 500 parties IA sans plantage ni blocage. Sauvegarde puis reprise donnant la même empreinte finale. Seuils de la section 6.6 relevés à titre indicatif ; ils ne valident aucun équilibre |
| **B2 — Troisième faction et essais** | Préfecture, secteur et dotations, six affrontements, un véhicule par camp. Essai 3D : une escouade faite du mannequin d'Unreal, d'un accessoire généré et d'animations gratuites, tous ses états, la carte grise en volume. Essai réseau : deux machines de systèmes différents, connexion directe, empreintes comparées | Six affrontements jouables contre l'IA. Temps mesuré par unité habillée et par geste adapté ; liste des gestes qu'aucune animation gratuite ne couvre. Aucune occlusion non signalée sur le parcours de test. Dix parties réseau de 15 minutes sans divergence d'empreinte. Dix parties entre humains par affrontement, seuils 6.6 relevés. Budget d'affichage tenu sur le Mac de référence |
| **C — V1 réduite** | Six unités par faction, deux paliers et leurs branches ; personnages et animations 3D définitifs des 18 unités ; décors de deux cartes puis d'une troisième ; interface de jeu intégrée complète ; IA à deux tempéraments et trois niveaux ; tutoriel d'une faction ; réglages, accessibilité, son, récit de fin de partie ; exécutables | Dix testeurs extérieurs terminent le tutoriel sans aide, gagnent la partie d'initiation de huit minutes en moins d'une demi-heure (4.5) et distinguent chaque unité à sa silhouette, sans la couleur. 5 000 parties IA sans blocage. Sauvegardes relues après une mise à jour mineure. Exécutables macOS, Windows et Linux produits par une chaîne automatisée, les deux derniers sur une machine Windows. Seuils de la section 6.6 tenus sur trente parties entre humains par affrontement |
| **D — Extensions** | Multijoueur public, cartes, unités reportées, éditeur, modes à plus de deux | Une fiche par extension : coût, dépendances, raison d'être |

**Backlog ordonné de A1 à A3 : le prototype**

1. Projet Unreal en C++ qui se compile sur le Mac ; dépôt, schéma de données, validateur, tests du module.
2. État de simulation, boucle à pas fixe, commandes, empreinte.
3. Exécuteur en ligne de commande et format de relecture.
4. Vue de mise au point dans Unreal, caméra du dessus : formes, barres, sélection, ordres.
5. Carte grise : grille, files, gabarits de rue, passages, emplacements, objectifs.
6. Déplacement d'escouade, réservation, traversée entre alliés, blocage entre ennemis.
7. Les six scénarios de navigation, automatisés.
8. Pression, cohésion, rupture, crans, face et flanc.
9. Repli, zones de soutien, reconstitution à débit fixe.
10. Objectifs, propriété persistante, score par phases.
11. Trois unités par camp, ancrage et poussée, passe-cour.
12. Adversaire scripté : capture, défend, relève, se replie.
13. Journal de commandes instrumenté pour les critères de la section 10.
14. Huit testeurs extérieurs, trois parties chacun, décision écrite.

**Backlog ordonné de B1 et B2 : la tranche jouable**

1. Économie : équipes postées, places, expansions, désordre, files de production.
2. Brouillard par lignes de vue ; éclaireurs.
3. Relais : pose, sortie des recrues, transit, chute.
4. Quatre unités de la Convergence et du Bastion ; cantonnement ; barricades.
5. Palier 2 et première branche de ces deux camps (Atelier, Charpente).
6. IA scriptée à trois couches pour deux camps ; garde des dépôts.
7. Sauvegarde et reprise ; interface minimale complète (minicarte, files, alertes).
8. Vingt parties humaines contre l'IA ; premier réglage des durées.
9. Préfecture : secteur, dotations, sommations, PC mobile ; ses quatre unités.
10. Un véhicule par camp sur voies carrossables.
11. IA de la Préfecture ; les six affrontements.
12. Essai 3D : mannequin d'Unreal, accessoire généré, animations gratuites ; temps par unité ; gestes non couverts ; règles d'occlusion.
13. Essai réseau en lockstep, connexion directe ; dix parties sans divergence.
14. Dix parties entre humains par affrontement ; décision sur les écarts de 5.4.

**Backlog ordonné de C : la V1**

1. Habillage des 18 unités : mannequin d'Unreal, couleur et motif de camp, accessoire généré ; tronc de locomotion tiré des animations gratuites.
2. Les unités restantes (Fanfare ; Frondeurs ; Groupe d'intervention et Canon à eau) et les branches qui manquent.
3. Gestes propres des 18 unités, adaptés d'animations gratuites ; effets des capacités, annonces de zone.
4. Première carte habillée ; règles de lisibilité appliquées ; deuxième carte.
5. Interface de jeu intégrée : infobulles, prévisualisations, touches configurables, échelle, contraste.
6. IA : deux tempéraments, trois niveaux, aide affichée au niveau haut.
7. Son : brouhaha, signaux de capacité, alertes ; sous-titres des signaux.
8. Tutoriel d'une faction ; fiches des deux autres ; partie d'initiation.
9. Récit de fin de partie ; réglages ; sauvegardes versionnées.
10. Troisième carte ; trente parties entre humains par affrontement ; réglage.
11. Chaîne de production des exécutables sur trois systèmes ; essai auprès de dix testeurs extérieurs.

**Hypothèses d'équipe, qui conditionnent tout délai.** Aucune date n'est ferme sans elles.

- *Noyau de trois* : un programmeur de simulation et d'IA confirmé, un artiste technique sachant animer, un concepteur prenant cartes et interface ; son en prestation ; agents de programmation en appui. Ordres de grandeur : A, 2 à 3 mois ; B, 6 à 9 mois ; C, 12 à 18 mois.
- *Une personne avec des agents* : A reste réaliste en 3 à 4 mois. B double au moins. Pour C, vous avez écarté l'achat et la sous-traitance : les ressources artistiques sont les contenus gratuits d'Unreal et ce que je génère (8.9). La qualité visuelle de la V1 en dépend.
- Ce qui déplace tout : la compilation C++ sur ce Mac, l'expérience préalable d'Unreal, ce que les contenus gratuits couvrent réellement, l'accès régulier à des testeurs extérieurs.

---

## 10. Décision : le plus petit prototype

**« La Rue ».** Affichage vu de dessus dans Unreal, formes géométriques, aucune animation. Une carte grise d'environ six pâtés de maisons, trois objectifs, des rues, une avenue, une place, deux passages.

- **Deux camps, trois unités chacun.** Bastion : Piquets, Pavois, Béliers. Convergence : Cortège, Furets, Démonteurs.
- **Règles** : R1 à R5, ancrage et poussée, passe-cour. Pas de relais, pas de secteur.
- **Pas d'économie** : renforts à débit fixe. Score abaissé pour des parties de 8 à 10 minutes.
- **Adversaire** : un script qui capture, défend, relève et se replie.

Il répond à trois questions : commander des escouades dans des rues est-il fiable et agréable ; la cohésion crée-t-elle une décision de repli distincte de l'effectif ; tenir, barrer et contourner une rue produit-il des situations variées.

**Critères, sur huit testeurs extérieurs jouant trois parties chacun**

- au moins cinq relancent une partie sans y être invités ;
- au moins une décision engager-ou-replier toutes les 20 s en phase de contact, lue dans le journal de commandes ;
- au moins 40 % des ruptures précédées d'un ordre sur l'escouade ;
- interrogé à chaud sur trois ruptures par partie, le testeur explique correctement la cause au moins quatre fois sur cinq ;
- moins d'un ordre sur dix annulé pour cause de trajet inattendu ; aucun blocage hors ceux que R2 prévoit.

**Règle d'arrêt.** Si ces critères ne sont pas tenus après deux cycles de réglage, on révise la cohésion et les gabarits de rue avant tout investissement en 3D, en économie ou en troisième faction. S'ils sont tenus, le combat de rue est validé à cette échelle, pour le prix le plus bas possible ; l'économie, les relais et les secteurs restent à éprouver.

---

## Réponses directes à vos sept questions

**Pourquoi y rejouerait-on après dix parties ?** Dans le document d'origine, pour rien de structurel. Avec les corrections : six affrontements aux géométries différentes, deux branches par faction lisibles à la reconnaissance, des dispositions d'objectifs qui déplacent l'ouverture, un barème qui garde la partie ouverte jusqu'à la quatorzième minute tant que l'écart reste d'un objectif, et des moments qui se racontent en une phrase (« j'ai enfermé son Camion-sono place du Marché »). Limite à connaître : contre une IA seule, la rejouabilité d'un RTS plafonne. C'est la raison de l'essai réseau en B2.

**Qu'apporte ce thème au gameplay ?** Aujourd'hui, presque rien. Avec R1, R2 et R4 : on fait rompre au lieu de détruire, la largeur de la rue décide de qui se bat, et les lieux s'occupent. Si ces trois règles sautent, le thème n'est plus qu'un habillage à risque.

**Les trois factions sont-elles intéressantes dès les premières minutes ?** Pas en l'état. Avec les corrections, chaque camp fait un geste propre dans la première minute : la Convergence pose son relais dès 0:00, la Préfecture envoie ses Motards et son PC dès 0:00, le Bastion envoie bâtir son cantonnement dès 0:00 et ancre à l'arrivée, vers 0:45. C'est une intention de conception, à vérifier en B1 et B2.

**Les rosters se ressemblent-ils trop ?** Oui : sept rôles sur neuf sont identiques. Ce qui change la manière de jouer, ce n'est pas le nom des fiches, c'est l'endroit où sortent les renforts, le nombre de têtes par escouade, la posture, l'endurance, et qui possède les véhicules.

**Comment empêcher les trois abus ?** Tableau 6.4 : la police par un budget de dotations rechargé dans un seul périmètre, la Convergence par la propriété persistante des objectifs et des relais qui coûtent de la population, le Bastion par la largeur de la rue et un score qui exige de tenir plus d'objectifs que l'adversaire.

**Cohésion, formations et secteurs : trop de règles à la fois ?** Oui. La correction est un budget (six règles de combat communes, trois par faction, aucune aura), la suppression des formations comme système, et une entrée des mécaniques étape par étape.

**Que supprimer de la V1 ?** Le troisième palier ; six unités sur vingt-quatre ; les navettes et les bâtiments de capacité ; les auras et les unités porteuses ; tout soin de terrain ; le transport en véhicule ; les voix ; la destruction de décor ; la quatrième carte ; deux styles d'IA sur quatre ; l'éditeur ; tout mode à plus de deux joueurs.

---

## Hypothèses prises et questions qui changeraient la direction

**Hypothèses**

- Équipe : vous, appuyé par des agents de programmation, dont moi. Tout se fait dans Unreal Engine ; les modèles viennent des contenus gratuits d'Unreal ou je les génère ; ni achat ni sous-traitance : vos décisions du 11 novembre 2026.
- Une machine Windows est disponible pour compiler les cibles Windows et Linux : à confirmer avant l'étape C.
- Machine de référence : votre MacBook Air M5, 24 Go, macOS 27.2.1. Tous les critères de vitesse s'y rapportent.
- Distribution sur une boutique PC et Mac généraliste.
- Carte : 260 m entre QG, 40 s à pied jusqu'à la médiane. Sur des cartes plus grandes, le coût du repli explose et les taux de score doivent baisser.
- Coûts et rendements : escouade de base autour de 100 Moyens, équipe à 30 par minute, 30 s par escouade. Tous les chiffres se règlent ensemble.

**Questions bloquantes**

Tranché le 11 novembre 2026 : tout se fait dans Unreal Engine, en C++ ; les modèles viennent des contenus gratuits d'Unreal ou sont générés ; ni achat ni sous-traitance.

Blocage levé le 11 novembre 2026 : avec le correctif 5.8.4, le projet se compile avec Xcode 27.2 (8.1).

1. **Quel registre ?** Avec un mannequin commun et des accessoires générés, le burlesque stylisé est à portée ; le réalisme tendu ne l'est pas sans achat (8.9). Je tiens donc le burlesque pour acquis, sauf avis contraire de votre part.
2. **Le multijoueur est-il un objectif ferme ?** L'essai réseau de B2 a lieu dans les deux cas, parce que les parties de test entre humains en dépendent. Si la réponse est oui, il devient en plus un jalon bloquant avant la production de contenu.

---

## Sources

Pages lues le 11 novembre 2026. Pour la documentation Unreal, ajouter `?application_version=5.8`.

**Unreal Engine**
- [U1] Annonce de la 5.8 : https://forums.unrealengine.com/t/unreal-engine-5-8-released/2729274 · correctif 5.8.4 : https://forums.unrealengine.com/t/5-8-4-hotfix-released/2842775 · 5.9 Preview : https://forums.unrealengine.com/t/unreal-engine-5-9-megajam-preview/2852840
- [U2] La route vers UE6 : https://www.unrealengine.com/en-US/news/the-road-to-ue-6
- [U3] Prérequis macOS : https://dev.epicgames.com/documentation/en-us/unreal-engine/macos-development-requirements-for-unreal-engine
- [U4] Prérequis Linux et compilation croisée : https://dev.epicgames.com/documentation/en-us/unreal-engine/linux-development-requirements-for-unreal-engine
- [U5] Plugins Mass : https://dev.epicgames.com/documentation/en-us/unreal-engine/API/PluginIndex/MassGameplay · https://dev.epicgames.com/documentation/en-us/unreal-engine/API/PluginIndex/MassAI · https://dev.epicgames.com/documentation/en-us/unreal-engine/API/PluginIndex/MassCrowd
- [U6] Évitement : https://dev.epicgames.com/documentation/en-us/unreal-engine/using-avoidance-with-the-navigation-system-in-unreal-engine
- [U7] Vue d'ensemble du réseau : https://dev.epicgames.com/documentation/en-us/unreal-engine/networking-overview-for-unreal-engine
- [U8] Physique : https://dev.epicgames.com/documentation/en-us/unreal-engine/physics-in-unreal-engine · https://dev.epicgames.com/documentation/en-us/unreal-engine/physics-settings-in-the-unreal-engine-project-settings
- [U9] Fichiers et versionnement : https://dev.epicgames.com/documentation/en-us/unreal-engine/using-perforce-as-source-control-for-unreal-engine · https://dev.epicgames.com/documentation/en-us/unreal-engine/source-control-in-unreal-engine
- [U10] Licence : https://www.unrealengine.com/en-US/license
- [U11] Ligne de commande et tests : https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-command-line-arguments-reference · https://dev.epicgames.com/documentation/en-us/unreal-engine/automation-test-framework-in-unreal-engine
- [U12] Notes de version 5.8 : https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-5-8-release-notes
- [U13] Contrôle de version : https://dev.epicgames.com/documentation/en-us/unreal-engine/resources-for-scaling-your-unreal-engine-team · https://dev.epicgames.com/documentation/en-us/unreal-engine/API/PluginIndex/GitSourceControl
- [U14] One File Per Actor : https://dev.epicgames.com/documentation/en-us/unreal-engine/one-file-per-actor-in-unreal-engine
- [U15] Python dans l'éditeur : https://dev.epicgames.com/documentation/en-us/unreal-engine/scripting-the-unreal-editor-using-python
- [U16] Personnages animés en nombre : https://dev.epicgames.com/documentation/en-us/unreal-engine/animation-budget-allocator-in-unreal-engine · https://dev.epicgames.com/documentation/en-us/unreal-engine/API/PluginIndex/AnimToTexture
- [U17] Modèle de projet Third Person : https://dev.epicgames.com/documentation/en-us/unreal-engine/third-person-template-in-unreal-engine
- [U18] Game Animation Sample Project : https://dev.epicgames.com/documentation/en-us/unreal-engine/game-animation-sample-project-in-unreal-engine
- [U19] Reciblage par IK Rig : https://dev.epicgames.com/documentation/en-us/unreal-engine/ik-rig-animation-retargeting-in-unreal-engine
- [U20] Geometry Scripting : https://dev.epicgames.com/documentation/en-us/unreal-engine/geometry-scripting-users-guide-in-unreal-engine
- [U21] Interchange : https://dev.epicgames.com/documentation/en-us/unreal-engine/interchange-framework-in-unreal-engine
- [U22] City Sample : https://dev.epicgames.com/documentation/en-us/unreal-engine/city-sample-project-unreal-engine-demonstration

**Achats**
- [F1] Licence de Fab, résumé non contractuel : https://www.fab.com/eula

**Techniques et précédents**
- [T1] Bettner et Terrano, « 1500 Archers on a 28.8 » : https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond · copie portant les deux signatures : https://web.cs.wpi.edu/~claypool/courses/4513-B03/papers/games/aoe.pdf
- [T2] Fiedler, déterminisme en virgule flottante : https://gafferongames.com/post/floating_point_determinism/
- [T3] Dawson, déterminisme en virgule flottante : https://randomascii.wordpress.com/2013/07/16/floating-point-determinism/
- [T4] Box2D, déterminisme : https://box2d.org/posts/2024/08/determinism/
- [T5] Emerson, champs de flux, Game AI Pro, chapitre 23 : http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter23_Crowd_Pathfinding_and_Steering_Using_Flow_Field_Tiles.pdf
- [T6] Stormgate : https://playstormgate.com/news/first-look-at-the-stormgate-editor-at-gdc · https://steamcommunity.com/app/2012510/allnews/?l=english
- [T7] Manuel de Dawn of War, édition combinée de 2006 : https://store.steampowered.com/manual/4570

**Annexes** (`annexes/`) : le document d'origine, les quatre contre-expertises, les deux rapports de faits avec leur contre-vérification (dont la liste des affirmations à ne pas avancer), les trois conceptions libres, et les constats des deux relectures adverses. Les passages de ces annexes qui portent sur d'autres moteurs datent d'avant votre décision et n'engagent plus rien.
