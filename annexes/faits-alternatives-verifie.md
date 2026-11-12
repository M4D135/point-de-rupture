# Contre-vérification : alternatives à Unreal Engine et techniques de référence du RTS

Relecture sceptique du fichier `faits-alternatives.md`, faite le 11 novembre 2026. Chaque URL a été rouverte pendant cette session ; rien n'est repris de mémoire.

## Bilan

- 129 identifiants relus : **113 CONFIRMÉS**, **4 CORRIGÉS**, **12 INVÉRIFIABLES**.
- Aucune affirmation marquée « VÉRIFIÉ » n'a été réfutée. Les quatre corrections portent sur une attribution (Y2-e) et sur trois points que le rapport d'origine laissait ouverts et que j'ai pu sourcer (G6-f, Y4-f, T3-f).
- Les 12 invérifiables sont tous des points que le rapport d'origine marquait déjà « NON DOCUMENTÉ », « NON VÉRIFIÉ » ou « SOURCE SECONDAIRE ».

## Méthode et limites de lecture

- Les pages web ont été lues par l'outil de lecture, qui passe par un modèle intermédiaire et restitue des extraits courts. J'ai demandé à chaque fois la citation exacte ; quand une phrase dépassait la limite, elle a été rendue en fragments consécutifs.
- Lectures directes, sans intermédiaire :
  - copie PDF de l'article d'Ensemble Studios (18 pages, texte natif) ;
  - chapitre 23 de Game AI Pro (10 pages, texte natif) ;
  - manuel Steam de Dawn of War (36 pages, scannées : OCR refait par moi sur les pages 4 à 9) ;
  - manuel Steam de Company of Heroes (32 pages, scannées : OCR refait par moi, recherche des passages sur renfort, retraite et victoire) ;
  - tableau Build Automation d'Unity, lu dans le HTML brut de la page (l'outil de lecture perdait l'alignement des colonnes).
- La documentation Godot « stable » affichait « Godot Engine 4.7 documentation in English » pendant la relecture.
- Les colonnes « Conséquence » du rapport d'origine sont des déductions de son auteur, pas des faits sourcés. Je ne les ai pas validées ; je signale celles qui dépassent ce que dit la source.

---

## A. GODOT

### G1

| Id | Verdict | URL relue | Remarque |
|---|---|---|---|
| G1 | CONFIRMÉ | https://godotengine.org/download/archive/ | Lu : « 4.7.2-stable, 18 August 2026 », « 4.7-stable : 18 June 2026 », « 4.8-beta3, 9 November 2026 », « 3.6.3-stable, 22 August 2026 ». Aucune 4.8 stable dans la liste. La page de téléchargement macOS propose la 4.7.2. |

### G2. macOS et Apple Silicon

| Id | Verdict | URL relue | Remarque |
|---|---|---|---|
| G2-a | CONFIRMÉ | https://godotengine.org/download/macos/ | « arm64 (Apple Silicon) · x86_64 (Intel) », libellé « macOS - Universal », et « Godot is code-signed and notarized for macOS by Prehensile Tales B.V. ». |
| G2-b | CONFIRMÉ | https://docs.godotengine.org/en/stable/about/list_of_features.html | « macOS (x86 and ARM, 64-bit only). » |
| G2-c | CONFIRMÉ | https://docs.godotengine.org/en/stable/engine_details/architecture/internal_rendering_architecture.html | Citation Metal exacte. Phrase de repli relue en entier : « Godot also supports Metal rendering via MoltenVK, which is used as a fallback when native Metal support is not available (e.g. on x86 macOS). » |
| G2-d | CONFIRMÉ | même page | « Since Godot 4.7, Metal 4 is now used when supported. » et « Metal 3 is automatically used as a fallback on older macOS and iOS versions. » Complément lu : Metal 4 exige macOS 26 ou iOS 26 au minimum. |
| G2-e | CONFIRMÉ | https://docs.godotengine.org/en/stable/tutorials/rendering/renderers.html + page d'architecture | Les deux citations existent. Précision : la mention d'ANGLE ne figure que sur la page d'architecture ; la page « renderers » dit seulement « This renderer uses OpenGL as the rendering driver. » |
| G2-f | INVÉRIFIABLE | pages ci-dessus | Aucune phrase sur des limites propres au pilote Metal dans les pages relues. Seul fait lu : « Both the Forward+ and Mobile Rendering methods can be used with Metal. » |

### G3. Export

| Id | Verdict | URL relue | Remarque |
|---|---|---|---|
| G3-a | CONFIRMÉ | https://docs.godotengine.org/en/stable/tutorials/export/exporting_projects.html | Les deux citations sont exactes. |
| G3-b | CONFIRMÉ | https://docs.godotengine.org/en/stable/about/faq.html | Liste lue : Windows, macOS, Linux, *BSD, Android, iOS, Web. |
| G3-c | CONFIRMÉ (tel que formulé : preuve indirecte seulement) | https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_windows.html | Citation exacte. J'ai cherché la phrase explicite sur trois pages de plus (export général, FAQ, https://godotengine.org/features/) : absente partout. L'export croisé depuis macOS reste non écrit noir sur blanc. |
| G3-d | CONFIRMÉ | même page | « There are 3 different processor architectures… » et « The default is x86_64… ». |
| G3-e | CONFIRMÉ, avec nuance | https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_linux.html | La phrase sur l'absence de modèles officiels vise bien rv64, ppc64 et loongarch64. Nuance : la page liste arm64 comme architecture mais ne dit pas en toutes lettres que des modèles officiels existent pour arm64. |
| G3-f | CONFIRMÉ | https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_macos.html | Les deux citations sont exactes. |
| G3-g | CONFIRMÉ | même page + https://docs.godotengine.org/en/stable/tutorials/export/running_on_macos.html | « In this case Godot will use an ad-hoc signature… » et « Projects exported without code signing and notarization will be blocked by Gatekeeper » (page export). La page « running » confirme que la signature ad hoc est le comportement par défaut. |
| G3-h | CONFIRMÉ | page export macOS | Titre de section lu : « If you have an Apple Developer ID Certificate and exporting from Linux or Windows ». Réserves lues sur la même page : les .app exportées depuis Windows perdent le drapeau exécutable ; le format DMG n'existe que depuis macOS. |

### G4. Navigation 3D

| Id | Verdict | URL relue | Remarque |
|---|---|---|---|
| G4-a | CONFIRMÉ | https://docs.godotengine.org/en/stable/classes/class_navigationserver3d.html | Citation exacte, suivie de « It does not handle A* navigation from AStar3D. » |
| G4-b | CONFIRMÉ | même page | La mention expérimentale est placée sous le titre de la classe, donc pour la classe entière. |
| G4-c | CONFIRMÉ | même page | Citation exacte. |
| G4-d | CONFIRMÉ | https://docs.godotengine.org/en/stable/tutorials/navigation/navigation_using_navigationagents.html | Citation exacte. |
| G4-e | CONFIRMÉ | page agents + référence de classe | Première citation sur la page agents ; la seconde (« Using the modified velocity directly… ») ne figure que dans la référence de classe NavigationServer3D. |
| G4-f | CONFIRMÉ | page agents | Citation exacte. La conséquence (« formations serrées… cas ratés ») est une déduction. |
| G4-g | CONFIRMÉ | page agents + https://docs.godotengine.org/en/stable/tutorials/navigation/navigation_using_navigationobstacles.html | Les deux citations sont exactes ; la doc écrit « 2D avoidance (xz axis) and the 3D avoidance (xyz axis) ». |
| G4-h | CONFIRMÉ | page obstacles | Citation exacte. |
| G4-i | CONFIRMÉ | https://docs.godotengine.org/en/stable/tutorials/navigation/navigation_using_navigationmeshes.html | Citation exacte. |
| G4-j | CONFIRMÉ | même page | Citations exactes. Complément lu : « If only pure data arrays are used as source geometry, the entire baking process can be done on a background thread. » |
| G4-k | INVÉRIFIABLE | pages ci-dessus | Aucun chiffre d'agents ni de coût dans les pages relues. |

### G5. Langages

| Id | Verdict | URL relue | Remarque |
|---|---|---|---|
| G5-a | CONFIRMÉ | https://docs.godotengine.org/en/stable/tutorials/scripting/other_languages.html | Liste lue : « GDScript (all versions) », « C# (.NET version) », « C++ (via GDExtension) ». |
| G5-b | CONFIRMÉ | https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/gdscript_basics.html | Citation exacte. La conséquence (« pas démontré pour une simulation lourde ») n'est pas dans la source. |
| G5-c | CONFIRMÉ | https://docs.godotengine.org/en/stable/about/list_of_features.html + https://godotengine.org/download/macos/ | « Supports .NET 8 and higher. » ; téléchargement séparé « macOS - .NET - Universal » ; « Digital store versions do not include .NET/C# support. » |
| G5-d | CONFIRMÉ | https://docs.godotengine.org/en/stable/tutorials/scripting/c_sharp/index.html | Citations exactes ; « Android support is currently experimental. » et « iOS support is currently experimental and has a few limitations. » |
| G5-e | CONFIRMÉ | https://docs.godotengine.org/en/stable/engine_details/engine_api/gdextension/what_is_gdextension.html | Citation exacte, plus « You can use it to run native code without compiling it with the engine. » |
| G5-f | CONFIRMÉ | page « Other languages » | Liste lue : D, Go, Java/Kotlin, Nim, Rust, Swift, Odin. |

### G6. Format texte, mode sans affichage, tests

| Id | Verdict | URL relue | Remarque |
|---|---|---|---|
| G6-a | CONFIRMÉ | https://docs.godotengine.org/en/stable/engine_details/file_formats/tscn.html | Citation exacte ; « There are five main sections inside the TSCN file ». |
| G6-b | CONFIRMÉ | même page | Citation exacte. La page mentionne aussi un exemple d'ArrayMesh enregistré en .tres. |
| G6-c | CONFIRMÉ | https://docs.godotengine.org/en/stable/tutorials/editor/command_line_tutorial.html | Citation exacte. |
| G6-d | CONFIRMÉ | même page | Les cinq options sont décrites sur la page. |
| G6-e | CONFIRMÉ | https://docs.godotengine.org/en/stable/engine_details/architecture/unit_testing.html | Citation exacte. La conséquence « aucun cadre de tests officiel pour le jeu » est une déduction : la page ne parle pas des projets de jeu. |
| G6-f | CORRIGÉ | https://godotengine.org/asset-library/asset/4390 et https://godotengine.org/asset-library/asset/1709 | Texte corrigé : « Deux cadres de tests communautaires sont publiés dans la bibliothèque de ressources officielle : GdUnit4 (fiche 4390, version 6.2.0, pour Godot 4.5, licence MIT, déposé par NullPointer) et GUT (fiche 1709, version 9.6.1, pour Godot 4.6, licence MIT, déposé par bitwes). Aucune des deux fiches n'affiche Godot 4.7. » Contenu communautaire, pas un outil de l'éditeur. |

### G7. Beaucoup de personnages animés

| Id | Verdict | URL relue | Remarque |
|---|---|---|---|
| G7-a | CONFIRMÉ | https://docs.godotengine.org/en/stable/tutorials/performance/using_multimesh.html | Citation exacte. Avertissement lu en tête : « The content of this page was not yet updated for Godot 4.7 and may be outdated. » |
| G7-b | CONFIRMÉ | même page | Citation exacte. |
| G7-c | CONFIRMÉ | https://docs.godotengine.org/en/stable/tutorials/performance/vertex_animation/animating_thousands_of_fish.html | Citation exacte. |
| G7-d | CONFIRMÉ | même page | Citation exacte. |
| G7-e | INVÉRIFIABLE | pages ci-dessus | La page ne donne que l'ordre de grandeur « thousands », aucun seuil. |

### G8. Physique 3D

| Id | Verdict | URL relue | Remarque |
|---|---|---|---|
| G8-a | CONFIRMÉ | https://docs.godotengine.org/en/stable/tutorials/physics/using_jolt_physics.html | Citations exactes, plus « Previously it was available as an extension but is now built into Godot. » |
| G8-b | CONFIRMÉ | https://docs.godotengine.org/en/stable/tutorials/physics/physics_introduction.html | Citation exacte, dans un encadré d'avertissement. |
| G8-c | CONFIRMÉ (constat d'absence) | page Jolt | Ni « deterministic » ni « determinism » sur la page. |
| G8-d | CONFIRMÉ | https://github.com/godot-jolt/godot-jolt/blob/master/README.md | Citation exacte ; l'extension se dit « in maintenance mode going forward ». Source primaire d'une extension devenue secondaire. |
| G8-e | CONFIRMÉ | https://github.com/godotengine/godot-proposals/issues/15750 | Titre lu : « Jolt Physics: add a way to make it possible to do deterministic tests », ouverte le 9 novembre 2026, statut ouvert. Citation exacte. C'est une discussion, pas une position de la documentation. |

### G9. Réseau

| Id | Verdict | URL relue | Remarque |
|---|---|---|---|
| G9-a | CONFIRMÉ | https://docs.godotengine.org/en/stable/tutorials/networking/high_level_multiplayer.html | Citations exactes. |
| G9-b | CONFIRMÉ | https://docs.godotengine.org/en/stable/classes/class_multiplayersynchronizer.html | Citation exacte. |
| G9-c | CONFIRMÉ (constat d'absence) | https://docs.godotengine.org/en/stable/tutorials/networking/index.html | Six pages listées, aucune sur lockstep ou rollback. Sur la page haut niveau : ni « lockstep », ni « rollback », ni « deterministic » ; « client-side prediction » apparaît une fois, dans la section sur la conception sécurisée. |
| G9-d | CONFIRMÉ | https://godotengine.org/asset-library/asset/2450 | « Godot Rollback Netcode (Godot 4) », déposé par dsnopek, 1.0.0-alpha, Godot 4.2, MIT. Citation exacte. |

### G10

| Id | Verdict | URL relue | Remarque |
|---|---|---|---|
| G10 | CONFIRMÉ | https://godotengine.org/license/ | Citation exacte. Lu aussi : distribution possible « even commercially » ; obligation « to include the copyright notice and license statement ». |

---

## B. UNITY

### Y1. Version LTS et éditeur macOS

| Id | Verdict | URL relue | Remarque |
|---|---|---|---|
| Y1-a | CONFIRMÉ | https://unity.com/releases/unity-6/support | Citation exacte ; la 6.3 est étiquetée « Latest LTS release ». La page ne dit rien des 6.4 à 6.7. |
| Y1-b | CONFIRMÉ | https://docs.unity.com/en-us/engine/current/manual/get-started/install-and-upgrade/getting-started-installing-unity/system-requirements | Titre « System requirements for Unity 6.6 » ; le sélecteur affiche « Version: 6000.6 Current ». |
| Y1-c | CONFIRMÉ | https://unity.com/blog/unity-industry-product-releases-2026 | Citation exacte, billet du 30 octobre 2026. Complément lu : la documentation 6000.7 existe et s'intitule « System requirements for Unity 6.7 Beta » (https://docs.unity.com/en-us/engine/6000.7/manual/get-started/install-and-upgrade/getting-started-installing-unity/system-requirements). |
| Y1-d | CONFIRMÉ | https://docs.unity.com/en-us/engine/6000.3/manual/get-started/install-and-upgrade/getting-started-installing-unity/system-requirements | Citations exactes. |
| Y1-e | CONFIRMÉ | page 6.6 ci-dessus | « (Intel processors) (deprecated) » lu dans la ligne CPU de macOS. |
| Y1-f | CONFIRMÉ | page 6.3 ci-dessus | Citation exacte. La page 6.6 est plus précise : Rosetta 2 n'y est exigé que pour le Progressive CPU lightmapper (obsolète) et Realtime Global Illumination. |

### Y2. Build Windows et Linux depuis macOS

| Id | Verdict | URL relue | Remarque |
|---|---|---|---|
| Y2-a | CONFIRMÉ | https://docs.unity.com/en-us/engine/6000.3/manual/programming-environment/scripting-backends/il2cpp/il2cpp-introduction | Paragraphe relu en entier, citations exactes. |
| Y2-b | CONFIRMÉ | https://docs.unity.com/en-us/engine/6000.3/manual/programming-environment/scripting-backends/il2cpp/linux-il2cpp-crosscompiler | Citation exacte. |
| Y2-c | CONFIRMÉ | même page | Trois paquets listés ; `com.unity.toolchain.macos-x86_64-linux-x86_64`, 2 GB. Aucune mention d'arm64, d'Apple silicon ni de Rosetta. L'hôte et la cible se déduisent du nom du paquet, la page ne les nomme pas. |
| Y2-d | CONFIRMÉ | https://docs.unity.com/en-us/build-automation/reference/supported-platforms-on-each-builder-os | Tableau relu dans le HTML brut. Colonnes : Windows 11 22H2, Windows 11 24H2, macOS Sequoia, macOS Tahoe. « Windows Mono » : 24H2, Sequoia, Tahoe. « Windows IL2CPP » : 24H2 seulement. « Linux » : Sequoia et Tahoe seulement. Service en nuage, pas l'éditeur local. |
| Y2-e | CORRIGÉ | https://discussions.unity.com/t/why-is-there-no-windows-il2cpp-build-module-for-macos-installations-of-unity/919172 | Texte corrigé : « Sur le forum officiel d'Unity, l'utilisateur JoshPeterson, qui s'exprime à la première personne du pluriel au nom de l'éditeur, a écrit le 31 mai 2023 que la compilation croisée Windows IL2CPP depuis macOS n'est pas prise en charge et que Mono l'est ; il a confirmé le 25 avril 2024 : "this is not something we plan to support for IL2CPP." » La citation du rapport est exacte et datée du 31/05/2023. Correction : la page lue n'affiche ni titre ni badge d'employé ; « ingénieur d'Unity » n'est pas établi par cette page. Reste une source secondaire. |
| Y2-f | INVÉRIFIABLE | https://docs.unity.com/en-us/engine/6000.3/manual/programming-environment/scripting-backends/intro | Cherché : la page liste Mono sur « Windows x86/x64/Arm64, OSX x64/Arm64, Linux x64, Android Armv7 » et qualifie sa chaîne de compilation croisée de « Minimal », mais n'écrit pas qu'un éditeur macOS construit un lecteur Windows Mono. |

### Y3. Entities, Netcode, Unity Physics, Burst

| Id | Verdict | URL relue | Remarque |
|---|---|---|---|
| Y3-a | CONFIRMÉ | https://docs.unity3d.com/Packages/com.unity.entities@1.4/manual/index.html | Citation exacte, en-tête « Entities \| 1.4.8 ». |
| Y3-b | CONFIRMÉ | https://docs.unity3d.com/Packages/com.unity.entities@7.0/changelog/CHANGELOG.html | « [7.0.0] - 2026-09-28 » en tête ; citation exacte. Le lien « @latest » du paquet renvoie vers la 7.0. |
| Y3-c | CONFIRMÉ | https://docs.unity3d.com/Packages/com.unity.netcode@1.9/manual/index.html | Citation exacte (faute « authoritive » d'origine), version 1.9.3, « 2022.3 (LTS) » et « Unity 6 (LTS) ». |
| Y3-d | CONFIRMÉ | https://docs.unity3d.com/Packages/com.unity.netcode@7.2/manual/index.html + changelog du même paquet | Citations exactes ; journal : « [7.2.0] - 2026-10-29 ». L'incohérence relevée s'explique : la documentation 6000.7 est étiquetée « Beta » (voir Y1-c). Le paquet 7.2 vise donc une version d'Unity encore en bêta. |
| Y3-e | CONFIRMÉ | https://docs.unity3d.com/Packages/com.unity.netcode@7.2/manual/intro-to-prediction.html | Citation exacte ; la page décrit « Rollback and replay » et ne mentionne pas le lockstep. La remarque sur le coût réseau qui croît avec le nombre d'entités n'est pas dans la page. |
| Y3-f | CONFIRMÉ | https://docs.unity3d.com/Packages/com.unity.physics@1.4/manual/design.html | Citation exacte, version 1.4.7. « Stateless » est un titre de section ; « Unity Physics forgoes this caching… ». |
| Y3-g | INVÉRIFIABLE | page design ci-dessus | La page design ne dit rien du déterminisme entre plateformes ou architectures. Je n'ai relu que cette page du paquet. |
| Y3-h | CONFIRMÉ | https://docs.unity3d.com/Packages/com.unity.burst@1.8/changelog/CHANGELOG.html | Entrée « [1.8.25] - 2025-09-16 », citation exacte ; tête du journal « [1.8.31] - 2026-10-07 ». |
| Y3-i | CONFIRMÉ | https://docs.unity.com/en-us/engine/6000.6/manual/programming-environment/script-compilation/burst/compilation/float-precision-determinism | Citation exacte, page de la version 6000.6 (courante). |
| Y3-j | CONFIRMÉ | même page | Citations exactes. Limites lues en plus : les intrinsèques matérielles peuvent rompre le déterminisme ; un pointeur de fonction venant d'un code non déterministe aussi ; les sous-normaux sont ramenés à zéro. |

### Y4. Licence et tarifs

| Id | Verdict | URL relue | Remarque |
|---|---|---|---|
| Y4-a | CONFIRMÉ | https://unity.com/blog/unity-is-canceling-the-runtime-fee | Citation exacte, billet du 12 septembre 2024. |
| Y4-b | CONFIRMÉ | https://unity.com/products/pricing-updates | Phrase relue : « The cancellation of the Runtime Fee is effective immediately, and will not apply to any games made with Unity 6 or any other version of Unity. » |
| Y4-c | CONFIRMÉ | https://unity.com/products/pricing-updates + https://unity.com/products/compare-plans | Citation exacte. La durée de douze mois vient de la page comparatif : « less than $200K USD of revenue or funds raised in the prior 12 months ». |
| Y4-d | CONFIRMÉ | https://unity.com/products/compare-plans | Citation exacte ; prix lu « from $2,310.00 /yr ». La page relue ne précise pas « par poste » ; seul le billet de 2024 écrivait « annually per seat » pour l'ancien tarif. |
| Y4-e | CONFIRMÉ | https://unity.com/products/pricing-updates + billet du 12/09/2024 | Citation exacte, « Announced November 10, 2025 » ; « Required for businesses with more than $25M in annual revenue. » |
| Y4-f | CORRIGÉ | https://unity.com/products/pricing-updates | Texte corrigé : « La page des mises à jour tarifaires liste, pour Unity Personal, "Splash screen optional with Unity 6" : l'écran de démarrage n'est pas imposé au plan gratuit avec Unity 6. » La page comparatif, elle, reste illisible sur ce point. |

---

## C. TECHNIQUES DE RTS

### T1. Lockstep déterministe : « 1500 Archers on a 28.8 »

| Id | Verdict | URL relue | Remarque |
|---|---|---|---|
| T1-a | CONFIRMÉ | https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond | Titre, « March 22, 2001 », signature « Paul Bettner » seule ; le nom de Mark Terrano n'apparaît pas comme auteur sur cette page. |
| T1-b | CONFIRMÉ | https://web.cs.wpi.edu/~claypool/courses/4513-B03/papers/games/aoe.pdf | PDF lu directement, page 1 : « GDC 2001: 1500 Archers on a 28.8 », « By Paul Bettner and Mark Terrano », « March 22, 2001 ». Copie d'une page Gamasutra hébergée par une université. |
| T1-c | CONFIRMÉ | les deux URL | Lu page 2 du PDF. |
| T1-d | CONFIRMÉ | les deux URL | Lu page 2 : « would have limited us to 250 moving units in the game at the most ». Chiffre lié au modem 28,8 de l'époque. |
| T1-e | CONFIRMÉ | les deux URL | Lu page 3. La durée du tour était adaptative : la figure 4 montre un tour de 1000 ms en cas de forte latence. |
| T1-f | CONFIRMÉ | les deux URL | Lu page 7 ; la phrase continue : entre 250 et 500 ms « very playable ». |
| T1-g | CONFIRMÉ | les deux URL | Lu pages 6 et 7. |
| T1-h | CONFIRMÉ | copie PDF | Lu page 10. |
| T1-i | INVÉRIFIABLE | — | Recherche refaite : aucune fiche GDC Vault trouvée. |

### T2. Déterminisme en virgule flottante

| Id | Verdict | URL relue | Remarque |
|---|---|---|---|
| T2-a | CONFIRMÉ | https://gafferongames.com/post/floating_point_determinism/ | Citation exacte, billet du 24 février 2010, Glenn Fiedler. |
| T2-b | CONFIRMÉ | même page | Citation exacte. |
| T2-c | CONFIRMÉ | https://randomascii.wordpress.com/2013/07/16/floating-point-determinism/ | Citation exacte, billet du 16 juillet 2013, Bruce Dawson. |
| T2-d | CONFIRMÉ | même page | Citation exacte. |
| T2-e | CONFIRMÉ | même page | Citation exacte ; liste lue : « Different floating-point architectures (x87 versus SSE versus VMX and NEON) », « Intermediate precision rules », « Different floating-point instructions such as fmadd ». |
| T2-f | CONFIRMÉ | https://box2d.org/posts/2024/08/determinism/ | « I test Box2D on x64 and ARM CPUs. » et « I also test on MSVC, GCC, and Clang compilers. » En-tête daté du 27 août 2024. Portée limitée aux processeurs et compilateurs testés par l'auteur. |
| T2-g | CONFIRMÉ | même page | « So FMA must be disabled for cross-platform determinism. » ; fonctions maison pour sinf, cosf et atan2f. |
| T2-h | CONFIRMÉ | https://jrouwe.github.io/JoltPhysics/ | Section « Deterministic Simulation » relue (fin de page) : option CMake, « approximately 8% slower », « OS (tested Windows, macOS, Linux) ». |
| T2-i | CONFIRMÉ, paraphrase levée | même page | La condition citée est exacte. La partie laissée en paraphrase est maintenant lue : « Broadphase queries (BroadPhaseQuery) are NOT deterministic because the broad phase can be modified from multiple threads. » et « This means the order in which you receive callbacks is not deterministic. » |
| T2-j | INVÉRIFIABLE | — | Aucune source cherchée ni lue sur la virgule fixe. Ce n'est pas une affirmation. |

### T3. Rollback appliqué au RTS

| Id | Verdict | URL relue | Remarque |
|---|---|---|---|
| T3-a | CONFIRMÉ | https://playstormgate.com/news/first-look-at-the-stormgate-editor-at-gdc | Citation exacte. La page n'affiche pas de date de publication ; elle évoque une présentation du « Wednesday, March 20 » à la GDC 2024. |
| T3-b | CONFIRMÉ | même page | Citation exacte. Communication de studio, sans description technique. |
| T3-c | CONFIRMÉ | https://frostgiant.com/press-releases-2/ | Communiqué du 7 décembre 2023 ; citation exacte ; « more than a thousand units on a map ». Chiffres d'annonce. |
| T3-d | CONFIRMÉ | https://store.steampowered.com/app/2012510/Stormgate/ | Citation exacte ; date de sortie affichée « 5 Aug, 2025 ». La fiche ne signale pas l'arrêt des modes en ligne (voir T3-f). |
| T3-e | INVÉRIFIABLE | — | Non relu : source secondaire, aucun texte primaire disponible. |
| T3-f | CORRIGÉ | https://steamcommunity.com/app/2012510/allnews/?l=english | Texte corrigé : « Le studio a annoncé lui-même, dans les actualités Steam du jeu, que son prestataire de serveurs avait été racheté et cessait son service fin avril 2026, puis a publié le 30 avril 2026 un correctif qui désactive les modes en ligne. » Citations lues : annonce du 3 avril 2026, « Hathora, has been purchased by an AI company, and they are winding down their service at the end of April. » ; « online modes will not be available at that point » ; « We hope to restore online play in a future patch ». Correctif du 30 avril 2026 : « this patch disables live service Versus and Co-op modes, and adds offline support to the Campaign ». L'année se lit dans les titres des billets. Aucun billet postérieur dans la liste lue. |
| T3-g | INVÉRIFIABLE | — | Aucune publication technique du studio trouvée. |

### T4. Champs de flux et navigation

| Id | Verdict | URL relue | Remarque |
|---|---|---|---|
| T4-a | CONFIRMÉ | http://www.gameaipro.com/ + PDF du chapitre 23 | « All book chapters are free to download. » ; chapitre d'Elijah Emerson. « 2015 » est la date de création du fichier PDF (métadonnée du 14/09/2015), pas une date de parution du livre. |
| T4-b | CONFIRMÉ | PDF, page 307 | Lu directement. |
| T4-c | CONFIRMÉ | PDF, page 308 | Lu directement. |
| T4-d | CONFIRMÉ | PDF, page 308 | Lu directement. |
| T4-e | CONFIRMÉ | PDF, page 310 | Lu directement ; suite : une demande de champ de flux par nœud de portail du chemin. |
| T4-f | CONFIRMÉ | PDF, pages 310-311 | Lu directement ; sans cette passe, flux « diamond-shaped » autour du but. |
| T4-g | CONFIRMÉ | PDF, pages 313-314 | Lu directement (sections 23.7 et 23.8). |
| T4-h | CONFIRMÉ | PDF, page 316, section 23.16 | Lu directement : espaces 3D et cartes de taille arbitraire figurent dans les travaux futurs. |
| T4-i | CONFIRMÉ | https://www.gdcvault.com/play/1014514/AI-Navigation-It-s-Not | Titre, intervenants, « Blizzard Entertainment, Nihilistic, University of Denver », « AI Summit », étiquette « free content ». |
| T4-j | INVÉRIFIABLE | même fiche | La fiche ne contient aucun résumé ; vidéo non lisible. |

### T5. Précédents de design

| Id | Verdict | URL relue | Remarque |
|---|---|---|---|
| T5-a | CONFIRMÉ | https://store.steampowered.com/manual/4570 | Manuel officiel (36 pages), OCR refait par moi, page 6, section « MORALE » : citation exacte. |
| T5-b | CONFIRMÉ | même manuel, page 6 | Citation exacte. |
| T5-c | CONFIRMÉ | même manuel, page 6 | « When broken, squads do very little damage to their enemies. » ; citation sur la vitesse exacte ; « The player does not lose control of broken squads. » |
| T5-d | CONFIRMÉ | même manuel, page 6 | Citation exacte ; exemples donnés : « Sergeant's Rally » et « Force Commander's Battlecry ». |
| T5-e | CONFIRMÉ | même manuel, page 6 | Section « SQUADS » : citation exacte ; escouade « Reinforced » et « Upgraded » une fois engagée. |
| T5-f | CONFIRMÉ | https://store.steampowered.com/manual/4560 | Manuel officiel (32 pages), OCR refait par moi, page 10 : citation exacte. |
| T5-g | CONFIRMÉ | même manuel | Page 7 : « Victory UI - Displays the captured Victory Points and Victory Countdowns. » Page 31 : « Retreat » et « Reinforce » dans la liste des commandes. Aucune règle détaillée de retraite ni de points de victoire trouvée par la recherche de mots-clés. |
| T5-h | CONFIRMÉ | https://www.feralinteractive.com/en/manual/companyofheroes2/latest/steam/ | Les deux citations sont exactes. Manuel de l'éditeur des versions Linux et Mac (« Developed for and published on Linux and Mac by Feral Interactive Ltd. »). |
| T5-i | CONFIRMÉ | même manuel | Citation exacte. |
| T5-j | CONFIRMÉ | même manuel | Citation exacte, plus « When one side's victory point counter reaches zero, they lose the battle. » |
| T5-k | INVÉRIFIABLE | même manuel | Le manuel ne donne aucune valeur de départ ni rythme de drainage. |
| T5-l | INVÉRIFIABLE | — | Non cherché, rien lu. |

---

## Faits utilisables tels quels

Confirmés seulement. Chaque fait reprend la formulation du rapport d'origine, sous les nuances notées plus haut.

**Godot**
- G1 — 4.7.2 stable du 18/08/2026, 4.7 du 18/06/2026, 4.8 en bêta 3 le 09/11/2026 : https://godotengine.org/download/archive/
- G2-a — éditeur macOS universel, signé et notarisé : https://godotengine.org/download/macos/
- G2-b — macOS x86 et ARM 64 bits : https://docs.godotengine.org/en/stable/about/list_of_features.html
- G2-c, G2-d — Metal natif sur Apple Silicon, MoltenVK en repli, Metal 4 depuis la 4.7 : https://docs.godotengine.org/en/stable/engine_details/architecture/internal_rendering_architecture.html
- G2-e — pilotes par rendu : https://docs.godotengine.org/en/stable/tutorials/rendering/renderers.html
- G3-a — modèles et préréglages d'export obligatoires : https://docs.godotengine.org/en/stable/tutorials/export/exporting_projects.html
- G3-b — plateformes d'export : https://docs.godotengine.org/en/stable/about/faq.html
- G3-c, G3-d — signature Windows depuis un autre système, x86_64 par défaut : https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_windows.html
- G3-e — Linux x86_64 par défaut, pas de modèles officiels pour rv64, ppc64, loongarch64 : https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_linux.html
- G3-f, G3-g, G3-h — signature, notarisation, signature ad hoc, rcodesign : https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_macos.html
- G4-a, G4-b, G4-c — NavigationServer3D, statut expérimental, effet à l'image de physique suivante : https://docs.godotengine.org/en/stable/classes/class_navigationserver3d.html
- G4-d, G4-e, G4-f — limites de l'évitement : https://docs.godotengine.org/en/stable/tutorials/navigation/navigation_using_navigationagents.html
- G4-g, G4-h — obstacles statiques et dynamiques : https://docs.godotengine.org/en/stable/tutorials/navigation/navigation_using_navigationobstacles.html
- G4-i, G4-j — cuisson à l'exécution : https://docs.godotengine.org/en/stable/tutorials/navigation/navigation_using_navigationmeshes.html
- G5-a, G5-f — langages officiels et liaisons communautaires : https://docs.godotengine.org/en/stable/tutorials/scripting/other_languages.html
- G5-b — définition de GDScript : https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/gdscript_basics.html
- G5-c — .NET 8 ou plus : https://docs.godotengine.org/en/stable/about/list_of_features.html
- G5-d — plateformes de C# : https://docs.godotengine.org/en/stable/tutorials/scripting/c_sharp/index.html
- G5-e — GDExtension : https://docs.godotengine.org/en/stable/engine_details/engine_api/gdextension/what_is_gdextension.html
- G6-a, G6-b — formats .tscn et .tres : https://docs.godotengine.org/en/stable/engine_details/file_formats/tscn.html
- G6-c, G6-d — mode sans affichage et options de ligne de commande : https://docs.godotengine.org/en/stable/tutorials/editor/command_line_tutorial.html
- G6-e — tests intégrés réservés au moteur : https://docs.godotengine.org/en/stable/engine_details/architecture/unit_testing.html
- G7-a, G7-b — MultiMesh (page signalée comme pouvant être datée) : https://docs.godotengine.org/en/stable/tutorials/performance/using_multimesh.html
- G7-c, G7-d — os calculés sur le processeur, animation par shader de sommets : https://docs.godotengine.org/en/stable/tutorials/performance/vertex_animation/animating_thousands_of_fish.html
- G8-a, G8-c — Jolt intégré depuis la 4.4, par défaut ; page muette sur le déterminisme : https://docs.godotengine.org/en/stable/tutorials/physics/using_jolt_physics.html
- G8-b — physique de Godot non déterministe : https://docs.godotengine.org/en/stable/tutorials/physics/physics_introduction.html
- G8-d — ancienne extension Godot Jolt sans garantie de déterminisme : https://github.com/godot-jolt/godot-jolt/blob/master/README.md
- G8-e — proposition ouverte le 09/11/2026 : https://github.com/godotengine/godot-proposals/issues/15750
- G9-a — API multijoueur haut niveau : https://docs.godotengine.org/en/stable/tutorials/networking/high_level_multiplayer.html
- G9-b — MultiplayerSynchronizer : https://docs.godotengine.org/en/stable/classes/class_multiplayersynchronizer.html
- G9-c — section Réseau de six pages, sans lockstep ni rollback : https://docs.godotengine.org/en/stable/tutorials/networking/index.html
- G9-d — module de rollback communautaire, alpha, pour Godot 4.2 : https://godotengine.org/asset-library/asset/2450
- G10 — licence MIT : https://godotengine.org/license/

**Unity**
- Y1-a — 6.3 LTS jusqu'en décembre 2027 : https://unity.com/releases/unity-6/support
- Y1-b, Y1-e — documentation courante 6.6, éditeur Intel obsolète : https://docs.unity.com/en-us/engine/current/manual/get-started/install-and-upgrade/getting-started-installing-unity/system-requirements
- Y1-c — 6.7 LTS annoncée « coming soon » : https://unity.com/blog/unity-industry-product-releases-2026
- Y1-d, Y1-f — Apple Silicon, macOS 13, mention de Rosetta 2 : https://docs.unity.com/en-us/engine/6000.3/manual/get-started/install-and-upgrade/getting-started-installing-unity/system-requirements
- Y2-a — pas de compilation croisée IL2CPP, sauf vers Linux : https://docs.unity.com/en-us/engine/6000.3/manual/programming-environment/scripting-backends/il2cpp/il2cpp-introduction
- Y2-b, Y2-c — chaînes d'outils Linux, paquet macOS x86_64 seul nommé : https://docs.unity.com/en-us/engine/6000.3/manual/programming-environment/scripting-backends/il2cpp/linux-il2cpp-crosscompiler
- Y2-d — tableau Build Automation : https://docs.unity.com/en-us/build-automation/reference/supported-platforms-on-each-builder-os
- Y3-a — Entities 1.4.8 : https://docs.unity3d.com/Packages/com.unity.entities@1.4/manual/index.html
- Y3-b — paquet de base depuis Unity 6.4, 7.0.0 du 28/09/2026 : https://docs.unity3d.com/Packages/com.unity.entities@7.0/changelog/CHANGELOG.html
- Y3-c — Netcode for Entities 1.9.3 : https://docs.unity3d.com/Packages/com.unity.netcode@1.9/manual/index.html
- Y3-d — Unity Netcode 7.2.0, exige Unity 6.7 : https://docs.unity3d.com/Packages/com.unity.netcode@7.2/manual/index.html
- Y3-e — prédiction sans déterminisme complet : https://docs.unity3d.com/Packages/com.unity.netcode@7.2/manual/intro-to-prediction.html
- Y3-f — Unity Physics se dit déterministe : https://docs.unity3d.com/Packages/com.unity.physics@1.4/manual/design.html
- Y3-h — FloatMode.Deterministic depuis Burst 1.8.25 : https://docs.unity3d.com/Packages/com.unity.burst@1.8/changelog/CHANGELOG.html
- Y3-i, Y3-j — portée et limites du mode déterministe : https://docs.unity.com/en-us/engine/6000.6/manual/programming-environment/script-compilation/burst/compilation/float-precision-determinism
- Y4-a — Runtime Fee annulée le 12/09/2024 : https://unity.com/blog/unity-is-canceling-the-runtime-fee
- Y4-b, Y4-c, Y4-e — pas de Runtime Fee, seuil de 200 000 USD, hausse de 5 % au 12/01/2026, Enterprise au-delà de 25 M USD : https://unity.com/products/pricing-updates
- Y4-d — Pro obligatoire au-dessus de 200 000 USD, à partir de 2 310 USD par an : https://unity.com/products/compare-plans

**Techniques de RTS**
- T1-a — article du 22/03/2001 : https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond
- T1-b à T1-h — deux auteurs, simulation identique, plafond de 250 unités, tours de 200 ms, latence de 250 ms, désynchronisation, rejeux : https://web.cs.wpi.edu/~claypool/courses/4513-B03/papers/games/aoe.pdf
- T2-a, T2-b — https://gafferongames.com/post/floating_point_determinism/
- T2-c, T2-d, T2-e — https://randomascii.wordpress.com/2013/07/16/floating-point-determinism/
- T2-f, T2-g — https://box2d.org/posts/2024/08/determinism/
- T2-h, T2-i — https://jrouwe.github.io/JoltPhysics/
- T3-a, T3-b — https://playstormgate.com/news/first-look-at-the-stormgate-editor-at-gdc
- T3-c — https://frostgiant.com/press-releases-2/
- T3-d — https://store.steampowered.com/app/2012510/Stormgate/
- T4-a à T4-h — http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter23_Crowd_Pathfinding_and_Steering_Using_Flow_Field_Tiles.pdf
- T4-i — https://www.gdcvault.com/play/1014514/AI-Navigation-It-s-Not
- T5-a à T5-e — https://store.steampowered.com/manual/4570
- T5-f, T5-g — https://store.steampowered.com/manual/4560
- T5-h, T5-i, T5-j — https://www.feralinteractive.com/en/manual/companyofheroes2/latest/steam/

**Utilisables dans leur version corrigée seulement**
- G6-f — GdUnit4 et GUT existent dans la bibliothèque officielle, contenu communautaire : https://godotengine.org/asset-library/asset/4390 et https://godotengine.org/asset-library/asset/1709
- Y4-f — écran de démarrage optionnel avec Unity 6 pour Unity Personal : https://unity.com/products/pricing-updates
- T3-f — arrêt des modes en ligne annoncé par le studio, correctif du 30/04/2026 : https://steamcommunity.com/app/2012510/allnews/?l=english
- Y2-e — message de forum, source secondaire, sans la qualité d'« ingénieur d'Unity » : https://discussions.unity.com/t/why-is-there-no-windows-il2cpp-build-module-for-macos-installations-of-unity/919172

## Faits à ne pas affirmer

- **G3-c, version forte** — « Godot exporte vers Windows et Linux depuis macOS » comme fait documenté : aucune phrase officielle ne le dit. Seule la preuve indirecte est établie.
- **G3-e, version forte** — « des modèles d'export officiels existent pour Linux arm64 » : la page ne l'écrit pas.
- **G2-f** — toute limite du pilote Metal propre à macOS.
- **G4-k, G7-e** — tout chiffre de charge pour Godot (nombre d'agents, coût de l'évitement, nombre de squelettes).
- **G6-e, version forte** — « il n'existe aucun cadre de tests officiel pour les jeux Godot » : c'est une déduction d'une page qui ne traite que des tests du moteur.
- **Y2-e, version d'origine** — « un ingénieur d'Unity a écrit… » : la qualité de l'auteur n'est pas affichée sur la page lue.
- **Y2-f** — « un éditeur macOS local construit un lecteur Windows Mono » comme fait du manuel : aucune phrase lue. Seuls le tableau du service en nuage et un message de forum vont dans ce sens.
- **Y2-c, extension** — la compilation croisée Linux IL2CPP depuis un Mac Apple Silicon, y compris par Rosetta : non écrite.
- **Y3-g** — le déterminisme d'Unity Physics entre plateformes ou architectures.
- **Y3-e, conséquence** — « le coût réseau croît avec le nombre d'entités répliquées » : absent de la page citée.
- **Y4-d, précision** — « 2 310 USD par an et par poste » : le « par poste » n'est pas lu sur la page actuelle.
- **T1-i** — l'existence d'une fiche GDC Vault pour « 1500 Archers ».
- **T2-j** — toute affirmation sur la virgule fixe : aucune source lue.
- **T3-e** — les détails d'architecture de SnowPlay (déterminisme requis, base lockstep, bibliothèque de rollback indépendante du moteur).
- **T3-g** — l'existence d'une publication technique du studio sur son rollback.
- **T3-c, version forte** — présenter « 64 Hz » et « plus de mille unités » comme des mesures : ce sont des chiffres de communiqué.
- **T4-a, précision** — « chapitre daté de 2015 » : 2015 est la date de création du fichier PDF.
- **T4-j** — toute technique précise attribuée à StarCraft II d'après la conférence de 2011.
- **T5-g, extension** — les règles de retraite et de points de victoire de Company of Heroes (2006) : le manuel ne les décrit pas.
- **T5-k** — la valeur de départ du compteur de points de victoire de Company of Heroes 2 et son rythme de drainage.
- **T5-l** — toute conférence de Relic décrivant ces règles.
