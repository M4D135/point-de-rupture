# Faits vérifiés : alternatives à Unreal Engine et techniques de référence du RTS

Relevé établi le 11 novembre 2026, uniquement à partir de pages lues pendant la session.

## Méthode et réserves de lecture

- Statuts employés : **VÉRIFIÉ** (source officielle ou primaire lue), **SOURCE SECONDAIRE**, **NON VÉRIFIÉ**, **NON DOCUMENTÉ** (les pages officielles lues n'en disent rien).
- Les pages web ont été lues par l'outil de lecture, qui restitue les citations par extraits courts. Elles sont données telles que restituées, dans la langue de la page ; une vérification à l'œil sur la page reste possible par l'URL.
- Quatre PDF ont été lus directement en texte : le chapitre de Game AI Pro et la copie de l'article d'Ensemble Studios (texte natif), les manuels Steam de Dawn of War et de Company of Heroes (pages scannées, lues par reconnaissance de caractères : une coquille d'OCR reste possible).
- La documentation Godot « stable » affichait « Godot Engine 4.7 documentation » le jour de la lecture.
- Une ligne par affirmation. « Conséquence » = conséquence pour le projet.

---

## A. GODOT

### G1. Version stable

| Champ | Contenu |
|---|---|
| Affirmation | La dernière version stable de la branche 4 est Godot 4.7.2, publiée le 18 août 2026 ; la 4.7 date du 18 juin 2026 ; la 4.8 n'existe qu'en bêta (bêta 3 du 9 novembre 2026). |
| Statut | VÉRIFIÉ (site officiel) |
| URL | https://godotengine.org/download/archive/ (et https://godotengine.org/download/macos/) |
| Citation | « 4.7.2-stable » / « 18 August 2026 » ; « 4.8-beta3 » / « 9 November 2026 » |
| Version, date | 4.7.2-stable, 18/08/2026. La branche 3 a une 3.6.3-stable du 22/08/2026. |
| Conséquence | Cibler la 4.7.x ; ne pas démarrer sur la 4.8 tant qu'elle est en bêta. |

### G2. macOS et Apple Silicon

| Id | Affirmation | Statut | URL | Citation | Version, date | Conséquence |
|---|---|---|---|---|---|---|
| G2-a | L'éditeur macOS est distribué en binaire universel (arm64 et x86_64), signé et notarisé. | VÉRIFIÉ | https://godotengine.org/download/macos/ | « arm64 (Apple Silicon) · x86_64 (Intel) » ; « Godot is code-signed and notarized for macOS by Prehensile Tales B.V. » | 4.7.2 | Éditeur natif sur Apple Silicon, sans Rosetta. |
| G2-b | La documentation liste macOS x86 et ARM 64 bits parmi les plateformes de l'éditeur et des projets exportés. | VÉRIFIÉ | https://docs.godotengine.org/en/stable/about/list_of_features.html | « macOS (x86 and ARM, 64-bit only). » | doc 4.7 | Idem. |
| G2-c | Un pilote Metal natif existe pour tout le matériel Apple Silicon ; MoltenVK sert de repli quand Metal natif n'est pas disponible (macOS x86). | VÉRIFIÉ | https://docs.godotengine.org/en/stable/engine_details/architecture/internal_rendering_architecture.html | « Godot provides a native Metal driver that works on all Apple Silicon hardware (macOS ARM). » | doc 4.7 | Sur la machine de développement, le rendu passe par Metal natif. |
| G2-d | Depuis Godot 4.7, Metal 4 est utilisé quand il est pris en charge, Metal 3 en repli. | VÉRIFIÉ | même page | « Since Godot 4.7, Metal 4 is now used when supported. » | 4.7 | Rien à configurer ; tester sur d'anciens macOS si on les vise. |
| G2-e | Les rendus Forward+ et Mobile utilisent Vulkan, Direct3D 12 ou Metal ; le rendu Compatibility utilise OpenGL, éventuellement via ANGLE sur Windows et macOS. | VÉRIFIÉ | https://docs.godotengine.org/en/stable/tutorials/rendering/renderers.html et page d'architecture ci-dessus | « This renderer uses Vulkan, Direct3D 12, or Metal as the rendering driver » ; « OpenGL + Compatibility (optionally through ANGLE on Windows and macOS) » | doc 4.7 | Le même projet change de pilote selon la plateforme : prévoir un test visuel par système. |
| G2-f | Limites propres à macOS du pilote Metal (fonctions absentes, écarts avec Vulkan). | NON DOCUMENTÉ | pages ci-dessus | aucune phrase sur ce point dans les pages lues | doc 4.7 | À mesurer sur prototype ; ne rien supposer. |

### G3. Export

| Id | Affirmation | Statut | URL | Citation | Version, date | Conséquence |
|---|---|---|---|---|---|---|
| G3-a | L'export exige des modèles d'export installés, et un préréglage par cible, y compris en ligne de commande. | VÉRIFIÉ | https://docs.godotengine.org/en/stable/tutorials/export/exporting_projects.html | « Export templates must be installed to export projects. » ; « Exporting from the command line still requires an export preset » | doc 4.7 | Les préréglages d'export sont à versionner avec le projet. |
| G3-b | Plateformes d'export officielles : Windows, macOS, Linux, BSD, Android, iOS, Web. | VÉRIFIÉ | https://docs.godotengine.org/en/stable/about/faq.html | « For exporting your games: » Windows, macOS, Linux, *BSD, Android, iOS, Web | doc 4.7 | Les trois cibles du projet sont couvertes. |
| G3-c | Aucune phrase explicite « depuis macOS on exporte vers Windows et Linux » n'a été trouvée ; la preuve est indirecte : la doc Windows prévoit la signature depuis « any other OS », la doc macOS prévoit l'export « from Linux or Windows ». | VÉRIFIÉ pour la preuve indirecte ; NON DOCUMENTÉ pour la phrase explicite | https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_windows.html | « you must have the Windows SDK (on Windows) or osslsigncode (on any other OS) installed » | doc 4.7 | Export croisé à confirmer par un essai réel depuis le Mac dès le premier jalon. |
| G3-d | Windows : trois architectures de processeur, x86_64 par défaut. | VÉRIFIÉ | même page | « The default is x86_64, this is the most common architecture of PC processors today. » | doc 4.7 | Cible Windows x86_64 par défaut. |
| G3-e | Linux : x86_64 par défaut, arm64 disponible ; pas de modèles officiels pour rv64, ppc64, loongarch64. | VÉRIFIÉ | https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_linux.html | « Official export templates are not provided by Godot, you will have to create them on your own. » | doc 4.7 | Linux x86_64 sans travail particulier. |
| G3-f | macOS n'exécute par défaut que des applications signées et notarisées ; la notarisation exige un certificat Apple Developer ID. | VÉRIFIÉ | https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_macos.html | « By default, macOS will run only applications that are signed and notarized. » ; « To notarize an app, you must have a valid Apple Developer ID Certificate. » | doc 4.7 | Distribution macOS publique = compte développeur Apple payant. |
| G3-g | Sans certificat, Godot applique une signature ad hoc ; un projet non signé ni notarisé est bloqué par Gatekeeper. | VÉRIFIÉ | même page et https://docs.godotengine.org/en/stable/tutorials/export/running_on_macos.html | « Projects exported without code signing and notarization will be blocked by Gatekeeper » | doc 4.7 | Suffisant pour le développement local, pas pour diffuser. |
| G3-h | Export macOS depuis Linux ou Windows possible avec rcodesign. | VÉRIFIÉ | page export macOS | « Install rcodesign, and configure the path to rcodesign in the Editor Settings » | doc 4.7 | Sans objet tant que le poste de build est le Mac. |

### G4. Navigation 3D

| Id | Affirmation | Statut | URL | Citation | Version, date | Conséquence |
|---|---|---|---|---|---|---|
| G4-a | NavigationServer3D gère cartes, régions et agents ; il ne fait pas l'A* de AStar3D. | VÉRIFIÉ | https://docs.godotengine.org/en/stable/classes/class_navigationserver3d.html | « NavigationServer3D is the server that handles navigation maps, regions and agents. » | doc 4.7 | Brique de base disponible sans extension. |
| G4-b | La classe NavigationServer3D est marquée expérimentale. | VÉRIFIÉ | même page | « Experimental: This class may be changed or removed in future versions. » | doc 4.7 | Risque de rupture d'API entre versions mineures : isoler la navigation derrière une interface maison. |
| G4-c | Les changements de navigation prennent effet à l'image de physique suivante, pas immédiatement. | VÉRIFIÉ | même page | « Most NavigationServer3D changes take effect after the next physics frame and not immediately. » | doc 4.7 | Latence d'une image à intégrer dans la simulation. |
| G4-d | L'évitement n'affecte pas la recherche de chemin. | VÉRIFIÉ | https://docs.godotengine.org/en/stable/tutorials/navigation/navigation_using_navigationagents.html | « Avoidance does not affect the pathfinding. » | doc 4.7 | L'évitement ne règle ni les goulets ni les blocages d'escouade. |
| G4-e | L'évitement ignore le maillage de navigation et la physique ; la vitesse corrigée peut sortir un agent de la zone praticable. | VÉRIFIÉ | page ci-dessus et référence de classe | « Avoidance exists in its own space and has no information from navigation meshes or physics collision. » ; « Using the modified velocity directly may move an agent outside of the traversable area. » | doc 4.7 | Prévoir un recalage sur le maillage après évitement. |
| G4-f | L'évitement est de type RVO et suppose un comportement « naturel » des agents. | VÉRIFIÉ | page agents | « RVO avoidance makes implicit assumptions about natural agent behavior. » | doc 4.7 | Les formations serrées et les arrêts nets donneront des cas ratés. |
| G4-g | Évitement 2D (plan xz) et 3D tournent dans des simulations séparées ; les obstacles statiques ne valent que pour l'évitement 2D. | VÉRIFIÉ | page agents et https://docs.godotengine.org/en/stable/tutorials/navigation/navigation_using_navigationobstacles.html | « 2D avoidance and 3D avoidance run in separate avoidance simulations » ; « Static obstacles only work for agents that use the 2D avoidance mode. » | doc 4.7 | Un RTS au sol reste en évitement 2D. |
| G4-h | Les obstacles dynamiques ne contraignent pas de façon fiable dans les espaces encombrés ou étroits. | VÉRIFIÉ | page obstacles | « Dynamic obstacles are not a reliable way to constrain agents in crowded or narrow spaces. » | doc 4.7 | Les véhicules ne peuvent pas reposer sur ce seul mécanisme. |
| G4-i | La cuisson du maillage à l'exécution est possible et se fait par défaut sur un fil d'arrière-plan. | VÉRIFIÉ | https://docs.godotengine.org/en/stable/tutorials/navigation/navigation_using_navigationmeshes.html | « The navigation mesh baking is by default done on a background thread » | doc 4.7 | Terrain destructible ou bâtiments posés en cours de partie envisageables. |
| G4-j | L'analyse de la géométrie source se fait toujours sur le fil principal et peut bloquer le rendu ; la doc recommande les formes physiques comme source. | VÉRIFIÉ | même page | « be aware that the geometry parsing always happens on the main thread » ; « For runtime (re)baking prefer using physics shapes as parsed source geometry. » | doc 4.7 | Découper la carte en tuiles et recuire par tuile, à partir des formes de collision. |
| G4-k | Nombre d'agents supporté, coût mesuré de l'évitement pour 150 à 200 agents. | NON DOCUMENTÉ | pages ci-dessus | aucun chiffre dans les pages lues | doc 4.7 | À mesurer sur prototype. |

### G5. Langages

| Id | Affirmation | Statut | URL | Citation | Version, date | Conséquence |
|---|---|---|---|---|---|---|
| G5-a | Trois langages officiels : GDScript, C# (édition .NET), C++ par GDExtension ; pas d'autre prévu. | VÉRIFIÉ | https://docs.godotengine.org/en/stable/tutorials/scripting/other_languages.html | « There are no plans to support additional languages officially. » | doc 4.7 | Choix à faire entre ces trois. |
| G5-b | GDScript est un langage de haut niveau, objet, à typage graduel, conçu pour Godot. | VÉRIFIÉ | https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/gdscript_basics.html | « GDScript is a high-level, object-oriented, imperative, and gradually typed programming language built for Godot. » | doc 4.7 | Adapté à la logique de jeu, pas démontré pour une simulation lourde. |
| G5-c | C# exige .NET 8 ou plus, par une édition séparée de l'éditeur ; les versions des boutiques numériques n'incluent pas C#. | VÉRIFIÉ | https://docs.godotengine.org/en/stable/about/list_of_features.html et https://godotengine.org/download/macos/ | « Supports .NET 8 and higher » ; « Digital store versions do not include .NET/C# support. » | 4.7.2 | Télécharger l'édition .NET depuis le site officiel. |
| G5-d | C# couvre Windows, Linux, macOS ; Android et iOS sont expérimentaux ; pas d'export Web. | VÉRIFIÉ | https://docs.godotengine.org/en/stable/tutorials/scripting/c_sharp/index.html | « projects written in C# support all desktop platforms (Windows, Linux, and macOS), as well as Android and iOS. » ; « Currently, projects written in C# cannot be exported to the web platform. » | doc 4.7 | C# convient aux trois cibles du projet. |
| G5-e | GDExtension charge des bibliothèques natives à l'exécution, sans recompiler le moteur. | VÉRIFIÉ | https://docs.godotengine.org/en/stable/engine_details/engine_api/gdextension/what_is_gdextension.html | « GDExtension is a Godot-specific technology that lets the engine interact with native shared libraries at runtime. » | doc 4.7 | Voie pour un cœur de simulation en C++ ou Rust. |
| G5-f | Liaisons communautaires listées : D, Go, Java/Kotlin, Nim, Rust, Swift, Odin, sans garantie de maturité. | VÉRIFIÉ | page « Other languages » | « Not all bindings mentioned here may be production-ready. » | doc 4.7 | Hors C++, la liaison est un risque à évaluer. |

### G6. Format texte, mode sans affichage, tests

| Id | Affirmation | Statut | URL | Citation | Version, date | Conséquence |
|---|---|---|---|---|---|---|
| G6-a | Le format .tscn est un format texte lisible, pensé pour la gestion de versions ; cinq sections. | VÉRIFIÉ | https://docs.godotengine.org/en/stable/engine_details/file_formats/tscn.html | « TSCN files have the advantage of being mostly human-readable and easy for version control systems to manage. » | doc 4.7 | Scènes et ressources relisibles et fusionnables dans Git. |
| G6-b | Le format .tres n'est décrit que par renvoi au .tscn sur cette page. | VÉRIFIÉ (partiel) | même page | « Like TSCN files, a TRES file may contain single-line comments starting with a semicolon » | doc 4.7 | Même traitement que les scènes. |
| G6-c | --headless lance le moteur sans affichage ni son. | VÉRIFIÉ | https://docs.godotengine.org/en/stable/tutorials/editor/command_line_tutorial.html | « Enable headless mode (--display-driver headless --audio-driver Dummy). Useful for servers and with --script. » | doc 4.7 | Simulation et tests exécutables en ligne de commande et en intégration continue. |
| G6-d | Options utiles documentées : --script, --check-only, --fixed-fps, --quit-after, --export-release. | VÉRIFIÉ | même page | « Force a fixed number of frames per second. This setting disables real-time synchronization. » | doc 4.7 | Pas fixe reproductible pour des tests de simulation. |
| G6-e | Le cadre de tests intégré (doctest, option --test) sert au code C++ du moteur, pas aux scripts de jeu. | VÉRIFIÉ | https://docs.godotengine.org/en/stable/engine_details/architecture/unit_testing.html | « The GDScript test runner is meant for testing the GDScript implementation » … « not for testing user scripts. » | doc 4.7 | Aucun cadre de tests officiel pour le jeu. |
| G6-f | Les cadres GUT et GdUnit4 existent dans la bibliothèque de ressources. | NON VÉRIFIÉ (résultats de recherche, pages non ouvertes) | https://godotengine.org/asset-library/asset/4390 | néant | — | À évaluer avant de s'y engager. |

### G7. Beaucoup de personnages animés

| Id | Affirmation | Statut | URL | Citation | Version, date | Conséquence |
|---|---|---|---|---|---|---|
| G7-a | MultiMesh dessine un très grand nombre d'instances en une primitive. | VÉRIFIÉ | https://docs.godotengine.org/en/stable/tutorials/performance/using_multimesh.html | « A MultiMesh is a single draw primitive that can draw up to millions of objects in one go. » | doc 4.7 (page signalée comme pouvant être datée) | Utile pour décor, projectiles, débris. |
| G7-b | Pas d'élimination par instance : visibilité tout ou rien. | VÉRIFIÉ | même page | « it will always be all-or-none visibility. » | doc 4.7 | Découper les MultiMesh par zone. |
| G7-c | L'animation par os est calculée sur le processeur et ne passe pas à l'échelle de milliers d'objets. | VÉRIFIÉ | https://docs.godotengine.org/en/stable/tutorials/performance/vertex_animation/animating_thousands_of_fish.html | « bones are animated on the CPU and so you end having to calculate thousands of operations every frame » | doc 4.7 | Les squelettes sont le poste à surveiller. |
| G7-d | Piste documentée : animation dans le shader de sommets avec instances statiques. | VÉRIFIÉ | même page | « Using vertex animation in a vertex shader, you avoid using bones » | doc 4.7 | Solution de repli pour les figurants lointains. |
| G7-e | Seuil chiffré à partir duquel les squelettes posent problème (150 à 200 personnages). | NON DOCUMENTÉ | pages ci-dessus | aucun chiffre | doc 4.7 | À mesurer ; l'échelle du projet est très en dessous des « milliers » visés par la doc. |

### G8. Physique 3D

| Id | Affirmation | Statut | URL | Citation | Version, date | Conséquence |
|---|---|---|---|---|---|---|
| G8-a | Jolt est intégré au moteur depuis la 4.4 et sert de moteur physique par défaut aux nouveaux projets. | VÉRIFIÉ | https://docs.godotengine.org/en/stable/tutorials/physics/using_jolt_physics.html | « The Jolt physics engine was added as an alternative to the existing Godot Physics physics engine in 4.4. » ; « By default, new projects will use it as the physics engine. » | doc 4.7 | Pas d'extension à installer. |
| G8-b | La documentation affirme que la physique de Godot n'est pas déterministe, quel que soit le moteur physique. | VÉRIFIÉ | https://docs.godotengine.org/en/stable/tutorials/physics/physics_introduction.html | « Physics in Godot, regardless of physics engine, is not deterministic, » | doc 4.7 | La physique du moteur ne peut pas porter une simulation en lockstep. |
| G8-c | La page Jolt de Godot ne contient ni « deterministic » ni « determinism ». | NON DOCUMENTÉ | page Jolt ci-dessus | aucune occurrence | doc 4.7 | Idem. |
| G8-d | L'ancienne extension Godot Jolt (en maintenance) déclare ne pas garantir le déterminisme, bien que Jolt le propose. | VÉRIFIÉ (primaire : dépôt de l'extension) | https://github.com/godot-jolt/godot-jolt/blob/master/README.md | « While Jolt itself offers deterministic simulations, Godot Jolt is not able to make such guarantees. » | lu le 11/11/2026 | Confirme G8-b. |
| G8-e | Une proposition ouverte le 9 novembre 2026 dans le dépôt officiel des propositions demande un mode d'ordre fixe pour Jolt ; elle est ouverte et a reçu des objections. | VÉRIFIÉ (discussion du dépôt officiel, pas une position documentaire) | https://github.com/godotengine/godot-proposals/issues/15750 | « This isn't really a Jolt-specific (or even physics-specific) question in my opinion. » | ouverte le 09/11/2026 | Ne pas compter sur une évolution prochaine. |

### G9. Réseau

| Id | Affirmation | Statut | URL | Citation | Version, date | Conséquence |
|---|---|---|---|---|---|---|
| G9-a | L'API multijoueur haut niveau est gérée par le SceneTree, avec ENet par défaut et des appels distants (RPC). | VÉRIFIÉ | https://docs.godotengine.org/en/stable/tutorials/networking/high_level_multiplayer.html | « High-level networking in Godot is managed by the SceneTree. » ; « By default, Godot provides an implementation based on ENet » | doc 4.7 | Convient à un modèle d'autorité et de réplication d'état. |
| G9-b | MultiplayerSynchronizer réplique des propriétés depuis l'autorité vers les pairs. | VÉRIFIÉ | https://docs.godotengine.org/en/stable/classes/class_multiplayersynchronizer.html | « Synchronizes properties from the multiplayer authority to the remote peers. » | doc 4.7 | Réplication d'état, pas synchronisation d'entrées. |
| G9-c | Aucun lockstep ni rollback officiel : la section Réseau a six pages, aucune sur ces sujets ; la page haut niveau ne les mentionne pas. | NON DOCUMENTÉ | https://docs.godotengine.org/en/stable/tutorials/networking/index.html | néant | doc 4.7 | Lockstep ou rollback seraient à écrire soi-même, au-dessus d'une simulation déterministe maison. |
| G9-d | Un module de rollback existe, mais communautaire (soumis par un utilisateur, licence MIT, version 1.0.0-alpha pour Godot 4.2). | VÉRIFIÉ (bibliothèque de ressources officielle, contenu communautaire) | https://godotengine.org/asset-library/asset/2450 | « an addon for implementing rollback and prediction netcode in the Godot game engine » | 1.0.0-alpha, Godot 4.2 | Référence d'étude, pas une fondation garantie. |

### G10. Licence

| Champ | Contenu |
|---|---|
| Affirmation | Godot est sous licence MIT (Expat) : usage libre, y compris commercial, sous réserve de conserver la notice de copyright et la licence. |
| Statut | VÉRIFIÉ |
| URL | https://godotengine.org/license/ |
| Citation | « Godot Engine is free and open source software released under the permissive MIT license (also named Expat license). » |
| Version, date | lu le 11/11/2026 |
| Conséquence | Aucune redevance ni seuil de revenus. |

---

## B. UNITY

### Y1. Version LTS et éditeur macOS

| Id | Affirmation | Statut | URL | Citation | Version, date | Conséquence |
|---|---|---|---|---|---|---|
| Y1-a | La dernière LTS est Unity 6.3 LTS, prise en charge jusqu'en décembre 2027 ; la 6.0 LTS l'était jusqu'en octobre 2026. | VÉRIFIÉ | https://unity.com/releases/unity-6/support | « Unity 6.3 LTS is supported until December 2027. » ; « Unity 6.0 LTS is supported through October 2026. » | lu le 11/11/2026 | La LTS à retenir aujourd'hui est la 6.3. |
| Y1-b | La documentation « courante » est celle d'Unity 6.6 (6000.6), version de mise à jour, non LTS. | VÉRIFIÉ | https://docs.unity.com/en-us/engine/current/manual/get-started/install-and-upgrade/getting-started-installing-unity/system-requirements | « System requirements for Unity 6.6 » | 6000.6 | Ne pas confondre version courante et LTS. |
| Y1-c | Unity 6.7 LTS est annoncée, sans date précise. | VÉRIFIÉ (annonce, sous réserve) | https://unity.com/blog/unity-industry-product-releases-2026 | « Unity 6.4, 6.5, and 6.6 shipped, with Unity 6.7 LTS coming soon. » | billet du 30/10/2026 | Une nouvelle LTS peut sortir en cours d'évaluation. |
| Y1-d | L'éditeur tourne sur Apple Silicon (M1 ou plus), macOS Ventura 13 ou plus récent. | VÉRIFIÉ | https://docs.unity.com/en-us/engine/6000.3/manual/get-started/install-and-upgrade/getting-started-installing-unity/system-requirements | « Apple M1 or above (Apple silicon-based processors) » ; « Ventura 13 or newer » | 6000.3 | Éditeur utilisable sur le Mac de développement. |
| Y1-e | En 6.6, l'éditeur Intel sur macOS est marqué obsolète. | VÉRIFIÉ | page 6.6 ci-dessus | « (Intel processors) (deprecated) » | 6000.6 | Sans effet sur un Mac Apple Silicon. |
| Y1-f | La page 6.3 mentionne Rosetta 2 pour les appareils Apple Silicon, dans une formulation ambiguë. | VÉRIFIÉ (texte ambigu) | page 6.3 ci-dessus | « Rosetta 2 is required for Apple silicon devices running on either Apple silicon or Intel versions of the Unity Editor » | 6000.3 | Prévoir Rosetta 2 installé. |

### Y2. Build Windows et Linux depuis macOS

| Id | Affirmation | Statut | URL | Citation | Version, date | Conséquence |
|---|---|---|---|---|---|---|
| Y2-a | IL2CPP ne se compile en général que sur la plateforme cible ; exception : Linux. | VÉRIFIÉ | https://docs.unity.com/en-us/engine/6000.3/manual/programming-environment/scripting-backends/il2cpp/il2cpp-introduction | « This means that cross-compilation is generally not supported » ; « The exception to this is Linux, where building Linux Players on other desktop platforms is supported. » | 6000.3 | Windows IL2CPP exige une machine Windows. |
| Y2-b | Le compilateur croisé Linux IL2CPP fournit des chaînes d'outils pour macOS, Windows et Linux. | VÉRIFIÉ | https://docs.unity.com/en-us/engine/6000.3/manual/programming-environment/scripting-backends/il2cpp/linux-il2cpp-crosscompiler | « Unity provides toolchain packages for macOS, Windows, and Linux. » | 6000.3 | Linux IL2CPP faisable depuis un Mac en principe. |
| Y2-c | Le seul paquet macOS nommé est macos-x86_64 vers linux-x86_64 (2 Go) ; la page ne cite aucun paquet pour hôte macOS arm64. | VÉRIFIÉ pour le texte ; NON DOCUMENTÉ pour l'hôte Apple Silicon | même page | « com.unity.toolchain.macos-x86_64-linux-x86_64 » | 6000.3 | Compilation croisée Linux depuis un Mac Apple Silicon à prouver par essai (Rosetta probable, non écrit). |
| Y2-d | Dans le service Build Automation, « Windows Mono » est coché sur les machines de build macOS, « Windows IL2CPP » seulement sur Windows 11 24H2, « Linux » sur macOS. | VÉRIFIÉ (tableau lu directement ; service en nuage, pas l'éditeur local) | https://docs.unity.com/en-us/build-automation/reference/supported-platforms-on-each-builder-os | ligne « Windows Mono » : cochée sous « macOS Sequoia » et « macOS Tahoe » | lu le 11/11/2026 | Depuis macOS, Windows se construit en Mono, pas en IL2CPP. |
| Y2-e | Un ingénieur d'Unity a écrit en 2023 que la compilation croisée Windows IL2CPP depuis macOS n'est pas prise en charge, mais que Mono l'est. | SOURCE SECONDAIRE (forum officiel, 31/05/2023) | https://discussions.unity.com/t/why-is-there-no-windows-il2cpp-build-module-for-macos-installations-of-unity/919172 | « If you do want to build a Windows Desktop Standalone Player on macOS, you can do so with the Mono scripting backend. » | 2023 | Concorde avec Y2-a et Y2-d. |
| Y2-f | Phrase du manuel affirmant qu'un éditeur macOS local construit un lecteur Windows Mono. | NON DOCUMENTÉ dans les pages lues | — | néant | 6000.3 | À confirmer par essai. |

### Y3. Entities, Netcode, Unity Physics, Burst

| Id | Affirmation | Statut | URL | Citation | Version, date | Conséquence |
|---|---|---|---|---|---|---|
| Y3-a | Entities fournit une implémentation orientée données de l'ECS ; la série autonome est en 1.4.8. | VÉRIFIÉ | https://docs.unity3d.com/Packages/com.unity.entities@1.4/manual/index.html | « It provides a data-oriented implementation of the Entity Component System (ECS) architecture. » | 1.4.8 | Technologie publiée, hors préversion. |
| Y3-b | Depuis Unity 6.4, Entities est un paquet de base livré avec l'éditeur ; dernière version 7.0.0 du 28/09/2026. | VÉRIFIÉ | https://docs.unity3d.com/Packages/com.unity.entities@7.0/changelog/CHANGELOG.html | « Starting with Unity 6.4, the package is implemented as a core package » | 7.0.0, 28/09/2026 | Sur la LTS 6.3, on reste sur la série 1.4 ; la numérotation change ensuite. |
| Y3-c | Netcode for Entities 1.9.3 : autorité serveur et prédiction client ; versions prises en charge 2022.3 LTS et Unity 6 LTS. | VÉRIFIÉ | https://docs.unity3d.com/Packages/com.unity.netcode@1.9/manual/index.html | « provides a server authoritive with client prediction framework that you can use to create multiplayer games. » | 1.9.3 | Modèle serveur autoritaire, pas lockstep. |
| Y3-d | Le paquet est renommé « Unity Netcode » (7.2.0 du 29/10/2026) et la page indique qu'il exige Unity 6.7. | VÉRIFIÉ (incohérence apparente : la 6.7 n'est annoncée que « coming soon », voir Y1-c) | https://docs.unity3d.com/Packages/com.unity.netcode@7.2/manual/index.html | « Unity Netcode (formerly "Netcode for Entities") is Unity's networking SDK » ; « Unity Netcode requires Unity version 6.7. » | 7.2.0 | Produit en mouvement : figer la version avant tout engagement. |
| Y3-e | La prédiction client de Netcode rejoue la simulation depuis un instantané ; le déterminisme complet n'est pas requis. | VÉRIFIÉ | https://docs.unity3d.com/Packages/com.unity.netcode@7.2/manual/intro-to-prediction.html | « It isn't necessary for the simulation itself to be fully deterministic » | 7.2.0 | Aucun lockstep fourni ; le coût réseau croît avec le nombre d'entités répliquées. |
| Y3-f | Unity Physics se décrit comme déterministe et sans cache d'état. | VÉRIFIÉ | https://docs.unity3d.com/Packages/com.unity.physics@1.4/manual/design.html | « Unity Physics is a completely deterministic rigid body dynamics and spatial query system » | 1.4.7 | Déterminisme annoncé, portée à préciser (voir Y3-g). |
| Y3-g | Déterminisme d'Unity Physics entre plateformes ou architectures. | NON DOCUMENTÉ | pages index et design du paquet 1.4 | aucune phrase sur ce point | 1.4.7 | Ne pas présumer le déterminisme x86-64 / ARM64 de la physique. |
| Y3-h | FloatMode.Deterministic est pris en charge par Burst depuis la 1.8.25 (16/09/2025) ; dernière version 1.8.31 (07/10/2026). | VÉRIFIÉ | https://docs.unity3d.com/Packages/com.unity.burst@1.8/changelog/CHANGELOG.html | « FloatMode.Deterministic is now supported by Burst. » | 1.8.25, 16/09/2025 | L'ancien statut « réservé pour plus tard » est périmé. |
| Y3-i | Ce mode vise des résultats identiques sur toutes les plateformes prises en charge, en 64 bits seulement. | VÉRIFIÉ | https://docs.unity.com/en-us/engine/6000.6/manual/programming-environment/script-compilation/burst/compilation/float-precision-determinism | « consistent across all supported platforms. Only supported on 64-bit architectures. » | 6000.6 | Voie officielle pour une simulation flottante déterministe entre x86-64 et ARM64. |
| Y3-j | Limites : ne vaut que pour le code compilé par Burst ; pas de garantie sur les bits des NaN ; coût de performance possible. | VÉRIFIÉ | même page | « FloatMode.Deterministic does not guarantee bitwise-identical NaN representations. » ; « only applies to Burst-compiled code » | 6000.6 | Toute la simulation doit vivre dans du code Burst, entrées comprises. |

### Y4. Licence et tarifs

| Id | Affirmation | Statut | URL | Citation | Version, date | Conséquence |
|---|---|---|---|---|---|---|
| Y4-a | La Runtime Fee est annulée depuis le 12 septembre 2024. | VÉRIFIÉ | https://unity.com/blog/unity-is-canceling-the-runtime-fee | « we've made the decision to cancel the Runtime Fee for our games customers, effective immediately. » | 12/09/2024 | Plus de redevance à l'installation. |
| Y4-b | Elle ne s'applique à aucun jeu, quelle que soit la version d'Unity. | VÉRIFIÉ | https://unity.com/products/pricing-updates | « will not apply to any games made with Unity 6 or any other version of Unity. » | lu le 11/11/2026 | Idem. |
| Y4-c | Unity Personal est gratuit jusqu'à 200 000 USD de revenus et de financement sur douze mois. | VÉRIFIÉ | https://unity.com/products/pricing-updates et https://unity.com/products/compare-plans | « This plan is available to customers with up to $200,000 in revenue and funding. » | lu le 11/11/2026 | Gratuit pour un développeur seul sous ce seuil. |
| Y4-d | Unity Pro est obligatoire au-dessus de 200 000 USD ; prix affiché à partir de 2 310 USD par an. | VÉRIFIÉ | https://unity.com/products/compare-plans | « Unity Pro will be required for businesses with revenue or funding greater than $200K USD in the last 12 months. » | lu le 11/11/2026 | Coût par poste à prévoir en cas de succès. |
| Y4-e | Hausse de 5 % de Pro et Enterprise depuis le 12 janvier 2026 ; Enterprise au-delà de 25 millions USD. | VÉRIFIÉ | https://unity.com/products/pricing-updates et billet du 12/09/2024 | « Unity Pro and Enterprise will see a 5% price increase, starting January 12th, 2026. » | annoncé le 10/11/2025 | Les tarifs bougent chaque année : revérifier avant décision. |
| Y4-f | Obligation d'écran de démarrage Unity dans le plan gratuit. | NON DOCUMENTÉ dans les pages lues | page comparatif | la ligne « Splash screen customization » existe, sans détail lisible | — | À vérifier sur la page avant diffusion. |

---

## C. TECHNIQUES DE RTS

### T1. Lockstep déterministe : « 1500 Archers on a 28.8 »

| Id | Affirmation | Statut | URL | Citation | Version, date | Conséquence |
|---|---|---|---|---|---|---|
| T1-a | L'article est publié par Gamasutra le 22 mars 2001, aujourd'hui hébergé par Game Developer ; la page actuelle ne porte que la signature de Paul Bettner. | VÉRIFIÉ | https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond | « 1500 Archers on a 28.8: Network Programming in Age of Empires and Beyond » ; « March 22, 2001 » | 22/03/2001 | Source primaire accessible gratuitement. |
| T1-b | La version imprimable d'origine le présente comme communication GDC 2001, signée Paul Bettner et Mark Terrano. | VÉRIFIÉ (copie de la page Gamasutra, hébergée par une université, lue en texte) | https://web.cs.wpi.edu/~claypool/courses/4513-B03/papers/games/aoe.pdf | « GDC 2001: 1500 Archers on a 28.8 » ; « By Paul Bettner and Mark Terrano » | 22/03/2001 | Attribution aux deux auteurs confirmée. |
| T1-c | Principe : la même simulation sur chaque machine, seules les commandes circulent. | VÉRIFIÉ | les deux URL ci-dessus | « to run the exact same simulation on each machine, passing each an identical set of commands » | 2001 | Le coût réseau ne dépend pas du nombre d'unités. |
| T1-d | Envoyer l'état des unités aurait plafonné le jeu à 250 unités mobiles. | VÉRIFIÉ | idem | « would have limited us to 250 moving units in the game at the most » | 2001 | Justifie le lockstep quand les unités sont nombreuses ; moins pressant à 200 unités avec les débits actuels. |
| T1-e | Les commandes sont exécutées deux tours de communication plus tard ; tours de 200 ms en général. | VÉRIFIÉ | idem | « Turns were typically 200 msec in length, with commands being sent out during the turn. » | 2001 | Latence de commande intrinsèque au modèle. |
| T1-f | 250 ms de latence de commande passaient inaperçues dans un RTS. | VÉRIFIÉ | idem | « For RTS games, 250 milliseconds of command latency was not even noticed » | 2001 | Budget de latence de référence pour le genre. |
| T1-g | La désynchronisation est le défaut le plus tenace ; de petites différences se multiplient. | VÉRIFIÉ | idem | « finding out-of-sync errors is that very subtle differences would multiply over time » | 2001 | Prévoir sommes de contrôle et outils de diagnostic dès le début. |
| T1-h | Le déterminisme a donné l'enregistrement des parties, outil de débogage. | VÉRIFIÉ | copie PDF | « Because our simulation is deterministic, and recorded games are synchronous » | 2001 | Les rejeux servent aussi de tests de non-régression en solo. |
| T1-i | Fiche de la session sur GDC Vault. | NON VÉRIFIÉ (non trouvée) | — | néant | — | Sans effet. |

### T2. Déterminisme en virgule flottante

| Id | Affirmation | Statut | URL | Citation | Version, date | Conséquence |
|---|---|---|---|---|---|---|
| T2-a | Glenn Fiedler conclut que le déterminisme flottant est possible, sous conditions. | VÉRIFIÉ | https://gafferongames.com/post/floating_point_determinism/ | « the answer is not a simple "yes" or "no" but "yes, if…" » | 24/02/2010 | Possible, jamais gratuit. |
| T2-b | Il tient la question pour non tranchée entre architectures et compilateurs. | VÉRIFIÉ | même page | « I consider this question by no means settled » | 2010 | Source ancienne : ne tranche pas x86-64 contre ARM64. |
| T2-c | Bruce Dawson : addition, soustraction, multiplication, division et racine carrée sont arrondies exactement selon IEEE. | VÉRIFIÉ | https://randomascii.wordpress.com/2013/07/16/floating-point-determinism/ | « the results of these operations are guaranteed to be the exact result correctly rounded. » | 16/07/2013 | Les opérations de base sont sûres si les réglages sont identiques. |
| T2-d | Les fonctions sin, cos, tan ne sont pas définies précisément par la norme. | VÉRIFIÉ | même page | « The precise results of functions like sin, cos, tan, etc. are not defined by the IEEE standard. » | 2013 | Fournir ses propres fonctions transcendantes. |
| T2-e | Précision intermédiaire, instructions FMA et architectures flottantes différentes (x87, SSE, NEON) sont des sources d'écart. | VÉRIFIÉ | même page | « Neither the C++ or IEEE standards mandate what precision intermediate calculations are done to. » | 2013 | Options de compilation à verrouiller. |
| T2-f | Erin Catto (Box2D) : déterminisme entre plateformes obtenu et testé sur x64 et ARM, avec MSVC, GCC et Clang. | VÉRIFIÉ (primaire, complément) | https://box2d.org/posts/2024/08/determinism/ | « I test Box2D on x64 and ARM CPUs. » | 27/08/2024 | Preuve récente que x86-64 et ARM64 peuvent concorder. |
| T2-g | Condition : désactiver la contraction FMA et écrire ses propres fonctions trigonométriques. | VÉRIFIÉ | même page | « FMA must be disabled for cross-platform determinism. » | 2024 | Règles concrètes pour un cœur en C ou C++. |
| T2-h | Jolt documente un mode déterministe entre plateformes (option CMake), environ 8 % plus lent, testé sur Windows, macOS, Linux. | VÉRIFIÉ (primaire, complément) | https://jrouwe.github.io/JoltPhysics/ | « turn on the CROSS_PLATFORM_DETERMINISTIC option in CMake. » ; « tested Windows, macOS, Linux » | lu le 11/11/2026 | Le déterminisme existe dans la bibliothèque, pas dans son intégration à Godot (G8). |
| T2-i | Condition posée par Jolt : les appels qui modifient la simulation doivent se faire exactement dans le même ordre. L'outil de lecture rapporte aussi, en paraphrase, que l'ordre des rappels d'écoute et de certaines requêtes n'est pas déterministe en multifil. | VÉRIFIÉ pour la condition citée ; paraphrase pour le reste | même page | « The APIs that modify the simulation are called in exactly the same order. » | idem | L'ordre d'exécution compte autant que l'arithmétique. |
| T2-j | Alternative en virgule fixe : aucune source lue pendant la session. | NON VÉRIFIÉ | — | néant | — | Option à documenter à part. |

### T3. Rollback appliqué au RTS : Frost Giant et SnowPlay

| Id | Affirmation | Statut | URL | Citation | Version, date | Conséquence |
|---|---|---|---|---|---|---|
| T3-a | Frost Giant présente SnowPlay comme une technologie maison associée à Unreal Engine 5. | VÉRIFIÉ (site officiel du jeu) | https://playstormgate.com/news/first-look-at-the-stormgate-editor-at-gdc | « how our custom-built SnowPlay technology combines with Unreal Engine 5 to form the most advanced RTS engine yet. » | GDC 2024 | Le précédent le plus proche repose sur une simulation hors moteur, greffée à Unreal. |
| T3-b | Frost Giant affirme introduire le rollback dans le RTS. | VÉRIFIÉ (communication officielle) | même page | « SnowPlay even allows us to introduce Rollback technology to RTS » | GDC 2024 | Le rollback en RTS a été annoncé par un studio ; pas de description technique. |
| T3-c | Cadence annoncée : 64 Hz ; plus de mille unités. | VÉRIFIÉ (communiqué officiel) | https://frostgiant.com/press-releases-2/ | « With a tick rate of 64Hz, Stormgate is three times more responsive than the previous leading RTS games. » | 07/12/2023 | Chiffres marketing, non mesurés ici. |
| T3-d | La fiche Steam mentionne le rollback et des serveurs répartis. | VÉRIFIÉ | https://store.steampowered.com/app/2012510/Stormgate/ | « advanced Rollback technology for silky smooth and stutter-free gameplay » | sortie affichée : 05/08/2025 | Idem. |
| T3-e | Détails d'architecture (déterminisme requis, base lockstep, bibliothèque de rollback indépendante du moteur, séparation simulation / rendu). | SOURCE SECONDAIRE (résumés de presse et site de fans d'un entretien vidéo ; articles non lisibles ou non ouverts) | https://www.stormgatenexus.com/article/digital-foundry-snowplay-tech | néant (lecture échouée) | — | Ne pas citer ces détails comme établis. |
| T3-f | Arrêt des modes en ligne de Stormgate fin avril 2026 après la vente de son prestataire de serveurs. | NON VÉRIFIÉ (résultats de recherche de presse, aucune page officielle lue) | — | néant | 2026 | Signale la dépendance à un prestataire de serveurs ; à vérifier avant de le citer. |
| T3-g | Article ou conférence technique de Frost Giant détaillant le rollback. | NON VÉRIFIÉ (rien trouvé) | — | néant | — | Aucune recette publiée à suivre. |

### T4. Champs de flux et navigation de StarCraft II

| Id | Affirmation | Statut | URL | Citation | Version, date | Conséquence |
|---|---|---|---|---|---|---|
| T4-a | Le chapitre 23 de Game AI Pro, d'Elijah Emerson, est en téléchargement libre sur le site du livre. | VÉRIFIÉ | http://www.gameaipro.com/ et http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter23_Crowd_Pathfinding_and_Steering_Using_Flow_Field_Tiles.pdf | « All book chapters are free to download. » | PDF daté de 2015 | Référence lisible sans achat. |
| T4-b | La technique vise des centaines à des milliers d'agents sur de très grandes cartes. | VÉRIFIÉ (PDF lu) | PDF ci-dessus | « moving hundreds to thousands of individual agents across massive maps » | Game AI Pro, chap. 23 | Dimensionnée pour bien plus que 150 à 200 unités. |
| T4-c | Elle vient de Supreme Commander 2 : secteurs de 10 × 10 cases d'un mètre reliés par des portails. | VÉRIFIÉ | PDF | « each grid square is 1 × 1 meter and each sector holds 10 × 10 grid squares » | idem | Structure en tuiles, compatible avec un terrain modifiable. |
| T4-d | Trois champs par secteur : coût, intégration, flux. | VÉRIFIÉ | PDF | « These three field types are cost fields, integration fields, and flow fields. » | idem | Vocabulaire de référence. |
| T4-e | Une requête fait d'abord un A* sur le graphe des portails, puis demande un champ de flux par portail. | VÉRIFIÉ | PDF | « The path request will first run A* through the portal node graph. » | idem | Coût partagé entre unités allant au même but. |
| T4-f | Une passe de ligne de vue permet d'ignorer le champ près du but. | VÉRIFIÉ | PDF | « When an agent is within the LOS it can ignore the Flow field results altogether » | idem | Évite les trajectoires en losange. |
| T4-g | Les champs sont mis en cache et partagés ; les changements de terrain marquent les secteurs à reconstruire, par tranches de temps. | VÉRIFIÉ | PDF | « each item in the queue is given a time slice of a fixed number of milliseconds » | idem | Budget de calcul maîtrisable par image. |
| T4-h | Limites reconnues par l'auteur : pas d'espaces 3D superposés, cartes de taille arbitraire à traiter par hiérarchie (travaux futurs). | VÉRIFIÉ | PDF, section 23.16 | « Support 3D spaces by connecting portal graph nodes across overlapping sectors. » | idem | Ponts et étages demandent un travail en plus. |
| T4-i | La session GDC 2011 « AI Navigation: It's Not a Solved Problem - Yet » existe sur GDC Vault, avec James Anhalt (Blizzard), Alexander Kring et Nathan Sturtevant, étiquetée contenu gratuit. | VÉRIFIÉ pour l'existence et les intervenants | https://www.gdcvault.com/play/1014514/AI-Navigation-It-s-Not | « James Anhalt, Alexander Kring, Nathan Sturtevant » ; « AI Summit » ; « free content » | GDC 2011 | Vidéo à regarder par un humain. |
| T4-j | Contenu de l'exposé d'Anhalt (maillage triangulé, A*, évitement). | NON VÉRIFIÉ (vidéo non lisible par les outils ; seuls des résumés de forums existent) | même fiche | néant | GDC 2011 | Ne pas attribuer de technique précise à StarCraft II sans visionnage. |

### T5. Précédents de design

| Id | Affirmation | Statut | URL | Citation | Version, date | Conséquence |
|---|---|---|---|---|---|---|
| T5-a | Dawn of War : les armes infligent des dégâts au moral comme à la santé. | VÉRIFIÉ (manuel officiel Steam, lu par OCR, page 6 du PDF) | https://store.steampowered.com/manual/4570 | « weapons do damage to unit Morale as well as to unit Health. » | manuel DOW1_ESD_MANUAL_UK | Deux jauges par escouade. |
| T5-b | À moral nul, l'escouade « rompt » et devient inefficace au combat. | VÉRIFIÉ (idem) | même manuel | « When a squad's Morale is reduced to zero, the squad 'breaks', rendering it combat ineffective. » | idem | Le moral neutralise sans tuer. |
| T5-c | Une escouade rompue fait très peu de dégâts, gagne en vitesse de déplacement et reste sous le contrôle du joueur. | VÉRIFIÉ (idem) | même manuel | « Broken squads get a movement speed bonus allowing the player to remove them from battle quickly. » | idem | Précédent d'un repli qui reste une décision du joueur. |
| T5-d | Le moral se régénère avec le temps et peut être relevé par des capacités de chefs. | VÉRIFIÉ (idem) | même manuel | « The Morale of units replenishes automatically over time » | idem | Les chefs d'escouade ont un rôle mécanique. |
| T5-e | Dawn of War : l'escouade est l'unité de base, se renforce et s'équipe sur le terrain. | VÉRIFIÉ (idem) | même manuel | « Squads respond to orders as a single entity. » | idem | Précédent direct du renfort en campagne. |
| T5-f | Company of Heroes (2006) : les escouades se renforcent en cas de pertes. | VÉRIFIÉ (manuel officiel Steam, OCR, page 10 du PDF) | https://store.steampowered.com/manual/4560 | « Squads can be reinforced with additional units in the event of casualties » | manuel COH_STEAM_MG_UK | Règle confirmée, sans détail de lieu. |
| T5-g | Ce manuel cite « Retreat » et « Reinforce » parmi les commandes d'unité, et une interface de victoire affichant points et comptes à rebours ; il ne décrit pas les règles de la retraite ni des points de victoire. | VÉRIFIÉ pour les mentions ; NON DOCUMENTÉ pour les règles | même manuel | « Victory UI - Displays the captured Victory Points and Victory Countdowns. » | idem | Le manuel de 2006 ne suffit pas à citer ces règles. |
| T5-h | Company of Heroes 2 : l'escouade en retraite court au quartier général et n'est plus contrôlable. | VÉRIFIÉ (manuel de l'éditeur des versions Mac et Linux) | https://www.feralinteractive.com/en/manual/companyofheroes2/latest/steam/ | « The squad will run back to your headquarters. » ; « While the squad is retreating, you will be unable to control it. » | manuel Feral, CoH 2 | Retraite = bouton, perte de contrôle, retour à la base. |
| T5-i | Company of Heroes 2 : le renfort se fait près d'un bâtiment de base ou d'un half-track. | VÉRIFIÉ (idem) | même manuel | « When a squad is near a base building or a half-track vehicle, » | idem | Le renfort est lié à un lieu. |
| T5-j | Company of Heroes 2 : chaque camp a un compteur de points de victoire, qui se vide quand l'adversaire tient plus de points ; à zéro, la partie est perdue. | VÉRIFIÉ (idem) | même manuel | « When you control more victory points than your opponent, their victory point counter will slowly drain. » | idem | Modèle de victoire par contrôle de terrain. |
| T5-k | Valeur de départ du compteur (500 selon des guides de joueurs) et rythme de drainage. | SOURCE SECONDAIRE (guides communautaires vus en résultats de recherche) | — | néant | — | Ne pas citer de chiffre. |
| T5-l | Conférences de développeurs de Relic décrivant ces règles. | NON VÉRIFIÉ (non cherchées en détail, rien lu) | — | néant | — | Piste ouverte. |

---

## Ce que je n'ai pas pu établir

1. **Export croisé Godot depuis macOS.** Aucune phrase officielle lue ne dit en toutes lettres que l'éditeur macOS exporte vers Windows et Linux. La preuve est indirecte (outils de signature prévus pour « any other OS », modèles d'export par plateforme). Un essai réel le confirmera.
2. **Limites du pilote Metal de Godot** propres à macOS : rien dans les pages lues.
3. **Chiffres de charge pour Godot** : nombre d'agents de navigation, coût de l'évitement, nombre de squelettes animés supportables. La documentation ne donne aucun seuil.
4. **Cadres de tests pour projets Godot** (GUT, GdUnit4) : vus en résultats de recherche seulement, pages non ouvertes.
5. **Position documentaire de Godot sur le déterminisme hors physique** (arithmétique, ordre d'exécution des scripts) : seule la physique est qualifiée de non déterministe dans la doc ; le reste vient d'une discussion du dépôt.
6. **Unity, compilation Linux IL2CPP depuis un Mac Apple Silicon** : la page ne nomme qu'une chaîne d'outils macOS x86_64.
7. **Unity, build Windows Mono depuis l'éditeur macOS local** : établi seulement par le tableau du service Build Automation et un message de forum de 2023, pas par le manuel.
8. **Unity Physics, déterminisme entre plateformes** : non traité dans les pages lues.
9. **Unity Netcode 7.2 « requires Unity version 6.7 »** alors que la 6.7 LTS n'est qu'annoncée : incohérence relevée, non expliquée.
10. **Écran de démarrage imposé par Unity Personal** : non lisible sur la page comparatif.
11. **Fiche GDC Vault de « 1500 Archers »** : non trouvée ; la mention GDC 2001 vient de la copie de la version imprimable de Gamasutra.
12. **Frost Giant** : aucune publication technique sur le rollback de SnowPlay ; seules des phrases de communication sont établies. L'entretien vidéo de l'ingénieur du studio et l'article de presse associé n'ont pas pu être lus. L'arrêt des modes en ligne en avril 2026 n'est attesté que par la presse, non lue en détail.
13. **Conférence GDC 2011 de James Anhalt** : existence et intervenants établis ; contenu non lu (vidéo).
14. **Company of Heroes (2006)** : le manuel ne détaille ni la retraite ni les points de victoire ; ces règles ne sont établies que pour Company of Heroes 2, par le manuel de l'éditeur des versions Mac et Linux. La page d'aide de Relic sur Company of Heroes 3 a refusé la lecture (erreur 403).
15. **Virgule fixe** comme alternative au flottant déterministe : aucune source lue.
16. **Exactitude littérale des citations web** : elles viennent de l'outil de lecture, par extraits ; les citations des quatre PDF ont été lues directement, deux d'entre elles par OCR.
