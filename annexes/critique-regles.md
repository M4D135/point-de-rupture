# Contre-expertise — règles communes, rythme et profondeur compétitive

## Verdict

Le document décrit deux jeux : une macro-économie StarCraft et un combat d'escouades à points de victoire, repli et renfort, donc un Dawn of War 1 / Company of Heroes urbain. À douze escouades, seul le second existe ; il faut l'assumer.
Trois défauts bloquants : le barème de score contredit la durée visée et rien ne borne la partie ; l'économie est surdimensionnée pour l'armée ; la cohésion est une seconde barre de vie qui retire le contrôle.
Tous se corrigent sans toucher à la section 2. Rien ici n'est démontré : ce sont des hypothèses à tester.

## À garder

- **Objectifs séparés des ressources (§3-4).** Score, économie et base adverse tirent l'armée vers trois lieux : c'est la source des décisions, si ces lieux sont réellement éloignés.
- **Aucune ressource à l'élimination, aucun bonus permanent de victoire (§4-5).** Deux boucles d'emballement classiques sont coupées d'entrée.
- **Repli volontaire et reconstitution payante (§5).** C'est le meilleur apport de Company of Heroes : la question n'est plus « qui gagne le combat » mais « quand est-ce que je lâche ».
- **Revenu de base (§4).** Un plancher évite l'abandon forcé après un raid réussi.
- **Zones annoncées, contrôles courts, pas de suppression sans fenêtre de réaction (§5).** Bons garde-fous, à chiffrer.
- **Dépôts plafonnés et trajets automatiques (§4).** L'économie reste une cible de raid sans imposer la micro-gestion des récolteurs.

## Constats, du plus grave au moins grave

### 1. Le barème contredit la durée visée et rien ne borne la partie — bloquant (§3)

| Situation | Calcul | Fin de partie |
|---|---|---|
| Trois objectifs tenus dès 2:00 | 500 / 2 = 250 s | 6:10 |
| Deux objectifs tenus sans interruption | 500 / 1 = 500 s | 10:20 |
| Majorité qui alterne, jamais de gel (500 à 499) | 999 s | 18:39 |
| Un objectif chacun, le troisième disputé | score gelé | jamais |

Pour atteindre 25 minutes, il faut au moins six minutes de score gelé : la cible « 15 à 25 minutes » n'est tenue que par l'enlisement. À l'inverse, un camp dominé perd en dix minutes : le palier 3 et la « fin de partie compétitive » de la §4 n'existent pas dans ce barème. Enfin, les ressources semblent inépuisables et le repli sauve les escouades : rien ne force la conclusion. Ambiguïté en prime : tenir un objectif contre zéro est une majorité, mais ne rapporte rien.

**Effet.** Parties soit expédiées, soit interminables ; premier engagement surpondéré (à 1 point par seconde, une rotation de repli de 90 secondes coûte 18 % de la victoire).

**Correction.** Score par différence d'objectifs tenus, barème croissant en trois phases annoncées (0,5 puis 1 puis 2 points par seconde et par objectif d'écart, à 2:00, 8:00 et 14:00), mort subite à 20:00. Recalcul : domination continue à un objectif d'écart, fin à 13:20 ; partie serrée sans gel, fin au plus tard à 17:50 ; domination totale, 7:33. Les six premières minutes ne pèsent que 180 points au maximum : l'avance précoce compte sans décider.

### 2. Une économie StarCraft pour une armée Company of Heroes — bloquant (§1, §4, §5)

Douze escouades de 4 à 6 personnages, soit 48 à 72 figurines, c'est l'échelle exacte de Company of Heroes et de Dawn of War 2. StarCraft II manœuvre 100 à 200 unités individuelles alimentées par 60 à 70 récolteurs. Si une escouade de base vaut 20 à 40 secondes de revenu, ordre de grandeur habituel du genre, le plafond de douze est atteint entre la quatrième et la sixième minute. Après, expansions, équipes supplémentaires et bâtiments de capacité ne financent plus que le remplacement : la moitié de la boucle « développer son économie » meurt avant la mi-partie.

Le précédent exact est Dawn of War 1 : bases, escouades renforcées sur le terrain, points stratégiques, deux ressources, moral. Il a fonctionné parce que son économie était petite et attachée à la carte.

**Effet.** Corvée de macro sans enjeu, ressources qui s'accumulent, promesse « StarCraft » non tenue.

**Correction.** Assumer : « combat d'escouades positionnel avec une base lisible ». Garder de StarCraft ce qui survit à cette échelle : l'ordre de construction, l'expansion risquée, le raid sur l'économie, la reconnaissance qui change la composition. Abandonner la production continue de récolteurs, les bâtiments de capacité et la course à la saturation. Exprimer le plafond en population (50), pas en nombre d'escouades.

### 3. La cohésion est une seconde barre de vie qui retire le contrôle — bloquant (§5)

Si les mêmes attaques vident les deux jauges, la cohésion est simplement la jauge qui tombe en premier, avec en prime une fuite subie. Dawn of War 1 avait exactement ce moral : les joueurs le traitaient comme un malus, pas comme une décision, et la suite l'a remplacé par la suppression. Deux modèles ont réussi. Dans Total War, le moral est piloté par la position (flanc, dos, isolement), pas par les dégâts. Dans Company of Heroes, la suppression vient d'armes précises, dans un arc, et se contre par le contournement ou le repli.

**Effet.** Une règle de plus à lire, aucune décision de plus, de la frustration à chaque dispersion subie.

**Correction.** Faire de la cohésion une jauge positionnelle à seuils, qui se régénère vite hors contact et qui conditionne la tenue du terrain. Formulation proposée :

> L'intégrité se perd pour de bon et se rachète. La cohésion se dépense pour tenir du terrain et revient seule dès qu'on le cède.

Concrètement : la cohésion baisse deux fois plus vite de flanc ou de dos, et en infériorité locale ; elle remonte avec des alliés adjacents et les soutiens de faction ; une escouade rompue ne peut plus tenir un objectif pendant six secondes mais reste commandable en déplacement ; les pertes d'intégrité triplent sur une escouade rompue. On obtient trois rôles lisibles (ceux qui tiennent, ceux qui rompent, ceux qui poursuivent) et une décision répétée : relever l'escouade ébranlée, ou la laisser quinze secondes de plus pour le score. C'est aussi ce que le thème apporte de propre : en ville, on disperse, on ne détruit pas.

Critère d'abandon : si, au prototype A, moins de 40 % des ruptures sont précédées d'un ordre du joueur, remplacer la jauge par un état binaire « sous pression » infligé par quelques unités dédiées.

### 4. « Contesté ne compte pas » fait de la contestation au rabais la stratégie dominante — majeur (§3)

Une seule escouade d'éclaireurs posée sur un objectif annule un point par seconde. Le camp mené n'a rien à reprendre : il lui suffit d'envoyer des escouades bon marché toucher les zones. Résultat : défilé d'unités sacrifiées et score figé, principal générateur du gel du constat 1.

**Correction.** Propriété persistante, comme dans Company of Heroes : un objectif reste à son propriétaire, et continue de rapporter, tant qu'il n'est pas neutralisé (10 secondes sans défenseur valide), puis capturé (10 secondes). La présence ennemie gèle la progression, pas le revenu. Pour arrêter le score adverse, il faut rompre les défenseurs.

### 5. La neutralisation du QG n'est pas chiffrée : raccourci abusif ou décor — majeur (§3)

Sans durée minimale, deux issues. QG fragile : les unités rapides (Autonomes, Brigade motorisée) gagnent en contournant une armée occupée sur les objectifs, et tout le monde garde trois escouades à la maison, ce qui tue la partie de carte. QG solide : la règle n'arrive jamais. Deux victoires parallèles complètes ne tiennent pas dans un duel à douze escouades.

**Correction.** Hiérarchiser : le score est la victoire principale ; le QG conclut une partie gagnée et sanctionne une base abandonnée. On ne le détruit pas, on l'occupe : 60 secondes cumulées sur son parvis avec au moins 12 points de population non rompus et sans défenseur valide ; alerte dès la première seconde ; production et reconstitution continuent et sortent contester. La pression sur la base reste une vraie stratégie, mais par ses effets économiques (équipes dispersées, armée rappelée, objectifs cédés). Cible à mesurer : 10 à 25 % des parties finies par le QG.

### 6. Six systèmes économiques, dont deux redondants et un qui n'est qu'une taxe — majeur (§4)

Deux ressources, équipes, dépôts plafonnés, expansions, revenu de base, capacité construite, reconstitution. Si l'Équipement se récolte comme les Moyens, c'est le gaz de StarCraft réduit à une ligne de plus dans l'ordre de construction. Les bâtiments de capacité ne portent aucune décision ; on ne les remarque que le jour où on les oublie.

**Correction.** Garder deux ressources, mais les distinguer par la source et non par le nom. Les Moyens viennent du QG et des expansions. L'Équipement n'existe qu'aux expansions : on ne monte pas en technologie enfermé chez soi, ce qui règle au passage l'exigence « le revenu de base ne permet pas de gagner enfermé ». Supprimer les bâtiments de capacité (plafond fixe). Équipes hors population, limitées par les places de dépôt : six au QG, saturées en moins d'une minute ; la seule décision économique restante est l'expansion, et c'est la bonne.

### 7. Ni puits de ressources ni mécanisme de retour chiffré — majeur (§4)

« Une avance utile mais rattrapable » n'est adossée à aucune règle. La reconstitution au prorata exact rend le repli neutre ; le vainqueur d'un combat garde tout.

**Correction.** Reconstitution à 60 % du coût au prorata : le repli devient un choix rentable et le principal puits de ressources. Entretien continu à la Company of Heroes : chaque point de population au-delà de 20 retire 1 % du revenu des équipes, plafonné à 30 % ; l'armée pleine gagne moins, l'armée brisée se refait plus vite. Les paliers bruts de Warcraft III créaient une vraie décision mais restaient mal compris ; la version continue est plus douce. À retirer si personne ne la perçoit en test.

### 8. Temps morts et décisions automatiques dans la boucle — majeur (§3-5)

- **0:00 à 2:00.** Pas de score, peu d'unités : deux minutes de mise en place identique à chaque partie. StarCraft II est passé de 6 à 12 récolteurs au départ pour supprimer cela.
- **Aller-retour de repli.** Repli, reconstitution, retour : 90 à 120 secondes où l'escouade ne joue pas. Coût voulu, mais sans point de reconstitution avancé il devient le temps mort central.
- **Transitions.** Postures, déploiement du poste de commandement, mise en place des zones : une décision à l'ordre, puis une attente.
- **Décisions automatiques.** Équipes jusqu'à saturation, capacité, palier sans alternative, objectif le plus proche.

**Correction.** Départ avec quatre équipes, deux escouades et 150 Moyens : première décision réelle à 0:45. Reconstitution dans toute zone de soutien, y compris celles des factions : relais, fourgon et secteur deviennent d'abord des raccourcis de rotation. Seuil : jamais plus de 20 secondes sans décision utile après 1:00.

### 9. La rejouabilité repose sur l'IA et les cartes, pas sur les règles — majeur (§12)

Contre une IA, après dix parties, le joueur a trouvé l'ouverture qui gagne. Trois ou quatre cartes symétriques n'y changent rien. Ce qui fait rejouer un RTS, c'est l'incertitude sur le plan adverse et un choix d'ouverture qui dépend de ce qu'on voit.

**Correction.**
1. Deux branches exclusives par faction au palier 2, visibles sur le bâtiment : la reconnaissance a quelque chose à lire, pour un coût de contenu faible.
2. Dispositions d'objectifs différentes selon les cartes (médiane droite, triangle, objectif central enclavé).
3. Style d'IA tiré au sort et non annoncé.
4. Courbes de fin de partie (score, revenu, population) pour apprendre.

### 10. La disposition des trois objectifs n'est pas spécifiée — mineur (§3)

En ligne base-centre-base, chacun tient « le sien » et tout se joue au centre : un seul couloir, la masse compacte gagne, la mobilité ne sert à rien. **Correction :** trois objectifs sur la médiane, à égale distance des deux QG ; tenir deux objectifs impose de se diviser.

### 11. Les contrôles et les zones n'ont pas de chiffres — mineur (§5)

« Courts » et « annoncés » ne se testent pas. **Correction :** contrôle de 3 secondes au plus, immunité de 8 secondes ensuite ; indicateur au sol 1,5 seconde avant tout effet de zone ; moins de 10 % du temps d'engagement passé sous contrôle.

### 12. Plafond exprimé en escouades, charge de contrôle non budgétée — mineur (§5)

Douze escouades avec posture, capacité et deux jauges, c'est la charge d'attention de Company of Heroes à son maximum. **Correction :** plafond en population ; une seule capacité active par unité de base ; option de recul automatique d'une escouade ébranlée laissée sans ordre.

## Réponses aux questions de l'auteur

**Pourquoi y rejouerait-on après dix parties ?** Aujourd'hui, pour rien de structurel. Avec les corrections : six affrontements, deux branches par faction, des ouvertures qui se lisent à la reconnaissance, des dispositions d'objectifs qui déplacent l'ouverture optimale, et un barème qui garde la partie ouverte jusqu'à la quatorzième minute.

**Qu'apporte le thème au-delà de l'apparence ?** Deux règles que les RTS militaires n'ont pas : on disperse au lieu de détruire (la cohésion comme jauge principale du combat), et on occupe au lieu de raser (QG et objectifs par occupation). Si ces deux règles sautent, le thème n'est plus qu'un habillage.

**Cohésion, formations et secteurs : trop de règles à la fois ?** Oui, si chacune modifie ses propres statistiques. Non, si relais, postures et secteurs agissent tous sur la seule cohésion, par trois moyens : le relais la régénère dans une zone, la posture ancrée lui donne un plancher de face, le secteur réduit la pression subie dans un périmètre. Une règle commune, trois accès, un seul soutien actif à la fois par escouade.

**Empêcher la police d'immobiliser, la Convergence de couvrir gratuitement, le Bastion de se regrouper ?** Du côté des règles communes : trois objectifs sur la médiane (une position fixe n'en tient qu'un) ; propriété persistante (couvrir exige de rompre un défenseur, pas de toucher la zone) ; bonus d'adjacence plafonné à deux alliés et pression doublée de flanc (la masse compacte n'ajoute rien et expose ses côtés).

**Faut-il simplifier une ressource ?** Non : la différencier (constat 6). **Le cumul des deux victoires ?** Le hiérarchiser (constat 5). **La prolongation ?** Mort subite à 20:00, plafond à 25:00 (règle V7).

**Que supprimer de la V1 ?** Dans mon périmètre : bâtiments de capacité, phase morte initiale, destruction instantanée du QG, règle « contesté ne compte pas », et le troisième palier tant que les parties de test ne dépassent pas régulièrement 14 minutes.

## Livrables demandés

### (a) Règles communes corrigées

Toutes les valeurs sont des hypothèses de prototype.

**Victoire**

- **V1.** Duel. Trois objectifs sur la médiane, à temps de trajet égal depuis chaque QG (tolérance 5 %).
- **V2.** Capture : une escouade de combat non rompue, sans ennemi non rompu dans la zone ; 10 s pour neutraliser, 10 s pour capturer. Ni les équipes logistiques ni les véhicules ne capturent.
- **V3.** Un objectif reste à son propriétaire, et lui rapporte, tant qu'il n'est pas neutralisé. Présence simultanée : progression gelée, propriétaire inchangé.
- **V4.** À partir de 2:00, points par seconde = (objectifs tenus − objectifs adverses) × taux de phase. Phase 1, de 2:00 à 8:00 : 0,5. Phase 2, de 8:00 à 14:00 : 1. Phase 3, dès 14:00 : 2. Chaque changement est annoncé 15 s avant.
- **V5.** Premier camp à 500 points : victoire.
- **V6.** QG neutralisé après 60 s cumulées d'occupation de son parvis par au moins 12 points de population non rompus, sans défenseur non rompu. La jauge redescend d'une seconde par seconde hors occupation. Alerte immédiate ; production et reconstitution continuent.
- **V7.** À 20:00, mort subite : tenir au moins un objectif d'écart pendant 60 s consécutives gagne. À 25:00, le score le plus élevé gagne ; égalité, partie nulle.

**Économie**

- **E1.** Départ : QG, 4 équipes logistiques, 2 escouades de base, 150 Moyens.
- **E2.** Équipe : 50 Moyens, 12 s, hors population, limitée par les places de dépôt. Rendement : 40 Moyens ou 30 Équipement par minute. Attaquée, elle s'abrite et ne produit rien ; elle peut être perdue.
- **E3.** QG : 6 places de Moyens. Revenu de base : 60 Moyens par minute, non réductible, jamais d'Équipement.
- **E4.** Deux emplacements d'expansion par camp, l'un abrité, l'autre exposé. Coût 250 Moyens, 30 s. Chacun offre 3 places de Moyens et 2 d'Équipement. L'Équipement n'existe qu'aux expansions. Retour sur investissement visé : 2:30 à 3:30.
- **E5.** Plafond de population fixe : 50. Aucun bâtiment de capacité. Escouade de base 4, spécialiste 6, véhicule 8.
- **E6.** Entretien : chaque point de population au-delà de 20 retire 1 % du revenu des équipes (30 % au plus).
- **E7.** Reconstitution : uniquement dans une zone de soutien (QG, expansion, structure de faction) ; 60 % du coût au prorata des membres perdus ; 4 s par membre.
- **E8.** Ni le score ni les éliminations ne donnent de ressources.

**Combat**

- **C1.** Chaque attaque a deux valeurs affichées : pertes (intégrité) et pression (cohésion).
- **C2.** Intégrité : membres valides. À zéro, l'escouade est retirée.
- **C3.** Cohésion de 0 à 100, trois états affichés : soudée (plus de 50), ébranlée (1 à 50, efficacité −25 %), rompue (0).
- **C4.** Pression subie : ×1 de face, ×2 de flanc ou de dos, ×1,5 en infériorité locale de population.
- **C5.** Récupération : +8 par seconde hors contact ; au contact, +1 par seconde et par escouade alliée adjacente (deux au plus), plus un seul soutien de faction.
- **C6.** Rompue : pendant 6 s, l'escouade ne peut ni attaquer, ni tenir ou contester un objectif ; elle se déplace 20 % plus vite et reste commandable en déplacement. Elle revient ensuite à 40 et ne peut pas être rompue pendant 8 s.
- **C7.** Pertes subies : ×1 soudée, ×1,5 ébranlée, ×3 rompue.
- **C8.** Repli volontaire : irréversible, course vers la zone de soutien la plus proche à +30 %, pertes subies divisées par deux, aucune action avant l'arrivée.
- **C9.** Contrôle : 3 s au plus, puis immunité de 8 s. Zone : indicateur au sol 1,5 s avant l'effet.
- **C10.** Aucun effet ne retire plus de la moitié de l'intégrité d'une escouade soudée en moins de 3 s.

### (b) Partie type de dix minutes

La Convergence (joueur) contre la Préfecture, objectifs Nord, Centre et Sud sur la médiane, règles ci-dessus. Illustration de la boucle, pas d'un équilibre.

- **0:00.** Deux équipes en file (QG saturé à 0:25, 300 Moyens par minute). Les Éclaireurs partent vers la base adverse par le sud, les Manifestants vers le Centre.
- **0:45 — décision difficile n° 1.** 250 Moyens en caisse : expansion immédiate (Équipement vers 1:45, mais trois escouades à l'ouverture du score) ou deux escouades de plus (quatre escouades et deux objectifs à 2:00, technologie retardée) ? Le joueur attend l'information de ses Éclaireurs.
- **1:10 — reconnaissance.** Les Éclaireurs voient une expansion préfectorale déjà posée, deux équipes sur l'Équipement, deux Patrouilles seulement. Lecture : palier 2 rapide, Compagnie de maintien de l'ordre et poste de commandement vers 5:00, faiblesse sur la carte d'ici là. **Adaptation :** escouades d'abord pour encaisser du score pendant la fenêtre, une escouade d'Autonomes pour raider l'expansion adverse, expansion repoussée à 2:45, avec un impératif : une Équipe de rupture avant 6:00.
- **2:00.** Nord et Centre à la Convergence, Sud à la Préfecture : +0,5 point par seconde.
- **2:45.** Expansion posée ; Équipement à partir de 3:40.
- **3:00.** Les Autonomes forcent deux équipes adverses à s'abriter vingt secondes, puis décrochent devant la Brigade motorisée. Gain modeste, mais la Brigade ne conteste rien pendant ce temps.
- **5:15.** La Préfecture arrive au Centre : une Compagnie, deux Patrouilles, poste de commandement en cours de déploiement. Score : 97 à 0.
- **5:35 — décision difficile n° 2.** Deux escouades de Manifestants sur trois sont ébranlées ; l'Équipe de rupture arrive dans quinze secondes. Tenir, c'est risquer la rupture et des pertes triplées, soit environ 200 Moyens et plus d'une minute de reconstitution. Céder, c'est offrir le Centre et environ 45 points. Le joueur cède, sans subir : les Manifestants se relèvent au relais, les Autonomes et les Éclaireurs filent au Sud, vide puisque la Préfecture s'est concentrée dans son secteur.
- **6:00 à 6:35.** Le Centre passe à la Préfecture (12 points pour elle), puis le Sud tombe : Nord et Sud contre Centre, la Convergence marque de nouveau. Le secteur a gagné un lieu et perdu la carte.
- **8:00 — phase 2, taux doublé.** Score : 157 à 12. La Préfecture, en retard au score mais en avance d'une expansion et d'un palier, envoie l'Escadron mobile reprendre le Sud (8:20) et marque 55 points en moins d'une minute.
- **8:40 à 9:25.** Poussée sur le Centre pendant le redéploiement du poste de commandement : l'Équipe de rupture rompt la Compagnie, les Autonomes poursuivent, le Centre change de main.
- **10:00.** Score : 202 à 67. Le Véhicule à eau vient d'apparaître ; trois Manifestants groupés sont désormais une faute. La phase 3 (2 points par seconde) reste devant : rien n'est joué, et la prochaine décision porte sur la branche de palier 2.

### (c) Seuils de validation à mesurer en prototype

Sur trente parties entre joueurs de niveau comparable :

- durée médiane entre 15 et 22 minutes ; aucune partie au-delà de 25 (plafond de V7) ;
- temps de score gelé inférieur à 20 % ;
- le vainqueur du premier engagement gagne moins de 60 % des parties ;
- 10 à 25 % de victoires par le QG ;
- au moins 40 % des ruptures précédées d'un ordre du joueur ;
- moins de 10 % du temps d'engagement passé sous contrôle ;
- aucun intervalle de plus de 20 secondes sans décision utile après 1:00.

## Hypothèses prises et incertitudes

- **Distances.** Trajet QG-médiane de 40 à 45 secondes à pied. Si les cartes sont plus grandes, le coût du repli explose et les taux de phase doivent baisser.
- **Coûts.** Escouade de base à 100 Moyens, 20 secondes, 4 points de population. Tous les chiffres des règles en découlent et sont à régler ensemble.
- **Références.** Les précédents sont cités de mémoire, pour leur structure ; leurs valeurs exactes n'ont pas été vérifiées et ne servent pas de base de réglage.
- **Barème par phases.** Il borne la durée mais peut sembler artificiel ; repli possible : taux fixe de 1 point par seconde et objectif à 600 (domination conclue à 12:00), sans protection contre l'avance précoce.
- **Entretien (E6).** Risque d'être invisible ; à supprimer sans regret si c'est le cas.
- **Cohésion.** Sa lisibilité à douze escouades n'est pas acquise : trois états et un sens d'attaque à afficher par escouade. C'est le premier risque à lever au prototype A.
- **IA.** Relève, repli et poursuite exigent une IA tactique fine ; coût non évalué ici.
- **Hors de mon angle.** Coûts des relais, postures et secteurs, rosters, technique : la partie type les suppose raisonnables sans les valider.
