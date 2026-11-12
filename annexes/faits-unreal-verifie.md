# Faits Unreal Engine — contre-vérification du 11 novembre 2026

Rapport relu : `faits-unreal.md` (70 identifiants, U1.1 à U10.8).

## Méthode de relecture

- Chaque URL a été rouverte pendant cette session. Sauf mention contraire, la page a été chargée dans un navigateur et son texte brut (`innerText`) a été interrogé par recherche de chaînes : les citations ci-dessous sont celles que j'ai lues, pas celles du premier rapport.
- Pour la documentation `dev.epicgames.com`, j'ai systématiquement relu la variante `?application_version=5.8` (titre de page constaté : « … | Unreal Engine 5.8 Documentation »), y compris pour les lignes que le premier rapport n'avait lues qu'en 5.9. Quand je cite « page 5.8 », c'est ce titre que j'ai vu.
- `www.unrealengine.com` s'affiche en français dans le navigateur : les citations de ce site sont une traduction servie par Epic, le texte anglais d'origine n'a pas été lu.
- Le bandeau de statut de la documentation s'affiche en français dans ma session : « Apprenez à utiliser cette fonctionnalité de type Experimental [ou Beta], mais faites preuve de prudence lorsque vous l'utilisez pour une livraison. » Je n'ai pas lu la formulation anglaise citée par le premier rapport ; le statut, lui, est constaté.
- Statut « Staff » sur le forum : constaté dans le code de la page (étiquette « Staff » à côté du pseudonyme, groupe `Epic_Games_Inc`).
- Deux fils de forum secondaires (U3.3 et U5.6) n'ont été relus que par WebFetch (extraction par un petit modèle).
- Verdicts : **CONFIRMÉ** (citation retrouvée, version actuelle, source officielle ou primaire), **CORRIGÉ** (le fond tient mais le texte doit changer ; correction exacte donnée), **INVÉRIFIABLE** (aucune source officielle actuelle).

Bilan : 61 confirmés, 7 corrigés, 2 invérifiables.

---

## U1 — Version stable et suite

| Id | Verdict | URL relue | Remarque |
|---|---|---|---|
| U1.1 | CONFIRMÉ | https://forums.unrealengine.com/t/unreal-engine-5-8-released/2729274 | Auteur « Flak », étiquette Staff et groupe Epic_Games_Inc constatés, catégorie Announcements. Horodatage lu : « 17 juin 2026 16:45 ». Citation exacte retrouvée. |
| U1.2 | CONFIRMÉ | https://www.unrealengine.com/en-US/news/unreal-engine-5-8-is-now-available | En-tête lu : « Actualités 23 juin 2026 L'Unreal Engine 5.8 est disponible ». L'écart de six jours avec le forum est réel et non expliqué. |
| U1.3 | CONFIRMÉ | https://forums.unrealengine.com/t/5-8-4-hotfix-released/2842775 | Flak (Staff), « 20 oct. 2026 15:25 », citation exacte. Aucune mention d'un 5.8.5 sur cette page ; ma recherche « 5.8.5 hotfix » sur le forum n'a rien affiché, sans que je puisse en déduire qu'il n'existe pas. |
| U1.4 | CONFIRMÉ | https://forums.unrealengine.com/t/unreal-engine-5-9-megajam-preview/2852840 ; https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-5-9-release-notes | Flak (Staff). Lu : « We've been accumulating changes for rendering and animation in UE5 Main for an eventual 5.9 release next year. » et « Preview releases are not fully quality-tested, are still under heavy active development, and should be considered as unstable until the final release. » Notes 5.9 : titre « Unreal Engine 5.9 Preview Release Notes », « Last updated 11/9/26 ». |
| U1.5 | CONFIRMÉ | https://www.unrealengine.com/en-US/news/the-road-to-ue-6 | Article daté « 22 juin 2026 », signé Marcus Wassmer. Citation exacte, qui se termine par « …une version 5.9, si nécessaire. » |
| U1.6 | CONFIRMÉ | même page | Citation exacte retrouvée. |

## U2 — Développer sur macOS

| Id | Verdict | URL relue | Remarque |
|---|---|---|---|
| U2.1 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/macos-development-requirements-for-unreal-engine?application_version=5.8 | « Minimum Operating System : Sonoma 14.5 ». Incohérence interne constatée : tableau matériel « Latest macOS Sequoia 14 », ligne 5.8 de l'historique « Latest macOS Sequoia 15 ». |
| U2.2 | CONFIRMÉ | même page | « Recommended Xcode Version : Xcode 26.1.1 », « Minimum Xcode Version : Xcode 26.0 », « Xcode 26.4 is not compatible with Unreal Engine. » |
| U2.3 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-5-8-release-notes?application_version=5.8 | Section macOS des notes 5.8 : « Recommended OS: Latest macOS Sonoma 14 — Minimum OS: macOS Sonoma 14.0 — Recommended Xcode: 15.4 or newer — Minimum Xcode: 15.2 … Note: Supported Xcode versions were downgraded from UE 5.6 ». Trois observations nouvelles : (a) ces valeurs sont mot pour mot celles de la ligne « 5.6 - 5.7 » de la page des prérequis macOS ; (b) dans les mêmes notes 5.8, la section « iOS / tvOS / iPadOS / visionOS » donne « Recommended Xcode: 26.1.1, Minimum Xcode: 26.0, Minimum OS: macOS Sonoma 14.5 », soit les chiffres de la ligne 5.8 des prérequis macOS ; (c) la ligne « IDE Version the Build farm compiles against » mentionne « Xcode 16.1 ». La contradiction est donc confirmée ; aucune page ne dit laquelle fait foi. |
| U2.4 | CONFIRMÉ | page des prérequis macOS (5.8) | « Recommended Processor : Apple Silicon M3 », « Minimum Processor : M1 or M2 depending on rendering features », 32 GB / 16 GB. La phrase sur les binaires universels figure dans la note de la ligne « 5.2 - 5.3 » de l'historique, suivie de « Code plugins are required to use universal binaries to be considered compatible with macOS. » |
| U2.5 | CONFIRMÉ | même page | Lu : Lumen logiciel « Apple Silicon M1+ » ; Lumen ray tracing matériel et MegaLights « Apple Sillicon M2+ (Experimental support) » ; Nanite et Virtual Shadow Maps « Apple Silicon M2+ (Beta support). » |
| U2.6 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/nanite-virtualized-geometry-in-unreal-engine?application_version=5.8 | Section « Supported Platforms », citation exacte. Aucune occurrence de « Mac », « macOS », « Metal », « Apple » ni « Vulkan » dans la page. |

## U3 — Compilation multiplateforme depuis un Mac

| Id | Verdict | URL relue | Remarque |
|---|---|---|---|
| U3.1 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/linux-development-requirements-for-unreal-engine?application_version=5.8 | Citation exacte, et reprise plus bas : « At this time, cross-compilation is only supported for Windows. Mac users currently have to resort to native compilation. » |
| U3.2 | CORRIGÉ | même page | Correction : « Hôtes prévus pour Linux : Windows (chaîne croisée v26, fondée sur clang 20.1.8) ou Linux natif (Ubuntu 22.04 ou Rocky Linux 8, clang 20.1.8) ; cible prise en charge : Linux x86_64. » La mention « installeur .exe » est retirée : je ne l'ai pas lue dans le texte de la page (le tableau affiche « v26 clang-20.1.8-based », ligne « 5.7-5.8 »). Le reste est confirmé mot pour mot. |
| U3.3 | INVÉRIFIABLE | https://dev.epicgames.com/documentation/en-us/unreal-engine/packaging-your-project?application_version=5.8 | La page d'empaquetage 5.8 est muette sur la machine hôte (seule phrase : « Developing and packaging for Windows and macOS does not require any additional software. »). Indices plus solides que le fil de 2025 cité, mais datant d'UE4 : https://forums.unrealengine.com/t/is-it-possible-to-build-games-on-windows-for-mac/291235 — un compte du groupe « Former_Staff » écrit en août 2014 « The official Mac SDK requires a Mac while the official Windows SDK requires Windows, hence the current setup. This isn't something we plan to change », et Tom Shannon (groupe Epic_Games_Inc) écrit en juillet 2016 « Mac users can't compile for Windows either. » ; https://forums.unrealengine.com/t/is-it-possible-to-build-for-windows-on-a-mac/299333 — même compte Former_Staff, novembre 2014 : « There's no Mac->Windows cross-compiler & SDK to compile UE4 for Windows from a Mac. » Rien de cela ne concerne la 5.8. Fil de mai 2025 relu par WebFetch : citation exacte, aucune réponse identifiée comme venant d'Epic. |
| U3.4 | CONFIRMÉ | notes de version 5.8 | « Recommended Visual Studio: 2026 — Minimum Visual Studio: 2022 v17.14 or newer ». La conséquence (« n'existe que sous Windows ») est une déduction du premier rapport, pas une phrase de la page. |

## U4 — Mass

| Id | Verdict | URL relue | Remarque |
|---|---|---|---|
| U4.1 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/mass-entity-in-unreal-engine?application_version=5.8 ; https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/MassEntity?application_version=5.8 | Page MassEntity : pas de bandeau, étiquette « experimental » en pied de page. Page d'API : « Type : Runtime — Location : /Engine/Source/Runtime/MassEntity/ », sans bandeau. La page « MassEntity Overview » (5.8) n'a ni bandeau ni étiquette experimental. |
| U4.2 | CONFIRMÉ | notes de version 5.8 | Section « Mass Framework: Faster, Modular, and Built for Scale », citation exacte. Aucun statut annoncé dans ce passage. |
| U4.3 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/API/PluginIndex/MassGameplay?application_version=5.8 | Bandeau Experimental constaté ; description exacte ; chemin « Engine\Plugins\Runtime\MassGameplay\MassGameplay.uplugin ». |
| U4.4 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/API/PluginIndex/MassAI?application_version=5.8 | Bandeau Experimental ; dépendances lues : MassGameplay, ZoneGraph, ZoneGraph Annotations, SmartObjects, StateTree, NavCorridor. À noter : les modules listés comprennent « MassNavMeshNavigation ». |
| U4.5 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/API/PluginIndex/MassCrowd?application_version=5.8 | Bandeau Experimental ; « Spline based AI crowd system » ; dépendances : ZoneGraph, MassGameplay, MassAI, StateTree. |
| U4.6 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/mass-avoidance-in-unreal-engine?application_version=5.8 | Bandeau Experimental constaté aussi sur la page 5.8 (le premier rapport ne l'avait vu qu'en 5.9). |
| U4.7 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-mass-gameplay-in-unreal-engine?application_version=5.8 | Page 5.8 : titre de section « Mass Replication (Experimental) », « It performs one-way replication from the server to its clients. », « Mass Replication is considered experimental for Unreal Engine 5.1. » Texte ancien non mis à jour, mais toujours la page officielle en vigueur. |
| U4.8 | CORRIGÉ | https://forums.unrealengine.com/t/massai-replication-state-in-5-7-and-future-roadmap/2684012 ; https://forums.unrealengine.com/t/mass-entity-roadmap-vision-and-more-questions/2527030 | Correction du statut : ce n'est pas une source secondaire. « James.Keeling » porte l'étiquette Staff et appartient au groupe Epic_Games_Inc (constaté sur la page). Texte corrigé : « D'après James Keeling, membre du personnel d'Epic (étiquette Staff), la réplication Mass via Iris n'arriverait vraisemblablement pas à temps pour la 5.8 (message du 1er juin 2026), et il n'y a pas de calendrier de passage des plugins en bêta ou en production (message du 25 avril 2025). » Citations exactes retrouvées ; la première se poursuit par « So things are still early, and I would not expect production-ready for this just yet. » Les messages ultérieurs (20 juin, 5 novembre) qui parlent d'un plugin MassIrisReplication dans la branche UE6 viennent d'utilisateurs, pas d'Epic. |
| U4.9 | CORRIGÉ | https://forums.unrealengine.com/t/mass-entity-roadmap-vision-and-more-questions/2527030 | Même correction de statut (auteur Staff). Texte corrigé : « D'après James Keeling (personnel d'Epic), au 25 avril 2025, il n'y avait pas de prise en charge Blueprint prévue pour Mass, et BehaviorTree / GAS ne seraient probablement pas portés. » Citations lues : « There are not plans for BP currently as it would negate all of the performance gains of Mass. » et « Some things will likely not be ported to work with Mass such as BehaviorTree or GAS. » Déclaration vieille de dix-huit mois, antérieure à la 5.8 : à dater explicitement. |
| U4.10 | CONFIRMÉ | https://www.unrealengine.com/en-US/news/unreal-engine-5-8-is-now-available | Lu : les collections MetaHuman permettent des foules « à l'échelle de centaines de personnages sur mobile et de milliers sur des plateformes plus haut de gamme », dans « un nouveau processus de création de foule qui s'appuie également sur Mass pour l'orchestration de la foule ». L'échelle chiffrée porte sur les collections MetaHuman, Mass étant cité pour l'orchestration. |
| U4.11 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-5-9-release-notes | Phrase complète : « The new Mass Characters plugin brings Mass traits for character interpolation and visualization, selective pawn replication, and a game feature action that sets up Mass characters. » Aucun statut indiqué. |

## U5 — Navigation

| Id | Verdict | URL relue | Remarque |
|---|---|---|---|
| U5.1 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/navigation-system-in-unreal-engine?application_version=5.8 ; https://dev.epicgames.com/documentation/en-us/unreal-engine/basic-navigation-in-unreal-engine?application_version=5.8 | Pages 5.8. « The system generates a Navigation Mesh from the collision geometry in the Level and divides the mesh into tiles. » ; « Select the RecastNavMesh-Default Actor in the Outliner ». Pas de bandeau. |
| U5.2 | CONFIRMÉ | page Navigation System (5.8) ; https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-how-to-modify-the-navigation-mesh-in-unreal-engine?application_version=5.8 | La phrase « three Generation Modes » est sur la page Navigation System. Précisions lues : le gain « up to 50% cheaper processing of the affected tiles » concerne le mode Dynamic Modifiers Only ; « By default, the Navigation Mesh is configured to be Static. » |
| U5.3 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/using-navigation-invokers-in-unreal-engine?application_version=5.8 | Citation exacte ; « Navigation Invokers are ideal for big Levels where building the Navigation Mesh in the editor is impractical. » |
| U5.4 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/using-avoidance-with-the-navigation-system-in-unreal-engine?application_version=5.8 | « Limited to the Character class. Does not use the Navigation Mesh for avoidance so Agents can potentially go "out of bounds". » |
| U5.5 | CONFIRMÉ | même page | Citations exactes. Aussi lu : le Detour Crowd Manager « can be used with any Pawn class ». |
| U5.6 | INVÉRIFIABLE | https://dev.epicgames.com/documentation/en-us/unreal-engine/crowd-manager-settings-in-the-the-unreal-engine-project-settings?application_version=5.8 | La page 5.8 décrit « Max Agents : Maximum number of agents supported by crowd. » sans valeur par défaut (absence confirmée). Indices anciens, tous UE4 : https://forums.unrealengine.com/t/ucrowdfollowingcomponent-51st-bot-does-not-move/294053 — compte du groupe « Former_Staff », septembre 2014 : « The 50 agent limit is hard-coded into the CrowdManager constructor. » ; https://forums.unrealengine.com/t/aimoveto-limited-to-50-characters-at-the-same-time/318104 — « MieszkoZ », mai 2015 : « it indeed defaults to 50 » (aucune étiquette Staff affichée sur ce message). Fil de 2016 relu par WebFetch : citation exacte, auteur anonyme. Aucune source pour la 5.8. |
| U5.7 | CONFIRMÉ | notes de version 5.8 et 5.9 | 5.8 : section « Navigation: Per-Mesh Control Over Walkable Surfaces », citation exacte. 5.9 : « The Navmesh can now build progressively, with control over how many tiles build per tick, and a new option keeps tiles outside the invoker radius. » |

## U6 — Réseau et déterminisme

| Id | Verdict | URL relue | Remarque |
|---|---|---|---|
| U6.1 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/networking-overview-for-unreal-engine?application_version=5.8 | Citations exactes. |
| U6.2 | CONFIRMÉ | même page (5.8) | Tableau « Network Modes » lu sur la page 5.8 : Standalone, Dedicated Server, Listen Server, Client. Standalone : « This mode is used for single-player and local multiplayer games. » |
| U6.3 | CONFIRMÉ | notes 5.8 ; https://dev.epicgames.com/documentation/en-us/unreal-engine/iris-replication-system-in-unreal-engine?application_version=5.8 | Notes : « Iris: Production-Ready Replication System — Iris is now production-ready for licensees in UE 5.8. » Page Iris 5.8 : bandeau Experimental et étiquette « experimental » constatés. La contradiction est réelle. Lu aussi dans la vue d'ensemble réseau : « The generic replication system is the system that UE currently uses by default. » |
| U6.4 | CONFIRMÉ (portée limitée) | page de vue d'ensemble réseau (5.8) | Aucune occurrence de « lockstep », « determinis », « peer-to-peer » ni « P2P » sur cette page (23 243 caractères dans ma lecture). Je n'ai pas refait la recherche sur tout le site : l'absence n'est établie que pour cette page et pour la page Networked Physics Overview. |
| U6.5 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/physics-in-unreal-engine?application_version=5.8 | Phrase complète, dans le passage sur les véhicules : « The system supports the Asynchronous Physics mode in Unreal Engine 5, which improves the determinism of the simulation and allows for predictable results every time the simulation runs. » Seule occurrence de « determinis » sur la page. |
| U6.6 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-5-migration-guide?application_version=5.8 | Citation exacte, suivie de « there is a potential delay between input to the physics system from the Game Thread and the physics system's reaction to that input. » Texte rédigé pour la migration UE4 vers UE5. |
| U6.7 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/physics-settings-in-the-unreal-engine-project-settings?application_version=5.8 | Page 5.8 : la mention « This feature is still experimental. Certain functionality might not work correctly. » suit Substepping, Substepping Async, Tick Physics Async et Async Fixed Time Step Size. |
| U6.8 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-command-line-arguments-reference?application_version=5.8 ; https://dev.epicgames.com/documentation/en-us/unreal-engine/general-engine-settings-in-the-unreal-engine-project-settings?application_version=5.8 | Citations exactes ; « UseFixedTimeStep : Use a fixed time step. » ; « FPS : Override fixed tick rate frames per second. » Réglage lu sur la page 5.8 : « Use Fixed Frame Rate : Specifies whether to use a fixed framerate. » |
| U6.9 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/networked-physics-overview?application_version=5.8 | Page 5.8, citation exacte. Aucune occurrence de « determinis », « lockstep » ni « experimental ». |

## U7 — Foules animées

| Id | Verdict | URL relue | Remarque |
|---|---|---|---|
| U7.1 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/animation-budget-allocator-in-unreal-engine?application_version=5.8 | Page 5.8, pas de bandeau ni d'étiquette de statut. Citations exactes (la page écrit « Animation Blueprint Allocator » dans la seconde, coquille d'origine). |
| U7.2 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/API/PluginIndex/AnimToTexture?application_version=5.8 | Bandeau Experimental ; description et chemin exacts. |
| U7.3 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/skeletal-mesh-lods-in-unreal-engine?application_version=5.8 | Citation exacte. Prérequis lu : « Your project has the Skeletal Mesh Reduction Plugin enabled. » |
| U7.4 | CONFIRMÉ | page Nanite (5.8) | « No geometry LODs. Nanite Skeletal Mesh uses animation LODs. Instancing with animation banks. » ; « Deformation with Morph Targets is not supported with Nanite. » Aucun statut pour la partie Skeletal Mesh. |
| U7.5 | CONFIRMÉ | article 5.8 du 23 juin 2026 | Citation exacte ; bascule lue : « entre des acteurs individuels de haute fidélité et des maillages surfacés instanciés (ISKM) de moindre fidélité en fonction de la proximité de la caméra ». |

## U8 — Langages, fichiers, versionnement

| Id | Verdict | URL relue | Remarque |
|---|---|---|---|
| U8.1 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/programming-with-cplusplus-in-unreal-engine?application_version=5.8 ; https://dev.epicgames.com/documentation/en-us/unreal-engine/blueprints-visual-scripting-in-unreal-engine?application_version=5.8 | Pages 5.8, citations exactes. Aucune des deux pages ne dit « ce sont les deux seules voies » : c'est une synthèse du premier rapport. |
| U8.2 | CORRIGÉ | https://www.unrealengine.com/en-US/news/the-road-to-ue-6 | Texte corrigé : « L'implémentation de Verse rendue visible dans le flux de développement UE6 n'est pas destinée à une adoption générale à ce stade ; Verse est la base du nouveau framework de gameplay d'UE6 (Scene Graph). » La citation est exacte, mais elle porte sur le flux UE6 : l'article ne dit rien, dans un sens ou dans l'autre, de l'usage de Verse dans UE5. L'absence de page Verse pour Unreal Engine dans la documentation n'a pas été revérifiée. |
| U8.3 | CONFIRMÉ | même page | « …les acteurs et les blueprints seront présents dans les premières versions de l'UE6. À terme, ces éléments seront abandonnés lorsque le nouveau framework sera suffisamment mature, et vous disposerez d'outils de conversion… » |
| U8.4 | CORRIGÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/scripting-the-unreal-editor-using-python?application_version=5.8 | Fond confirmé (bandeau Experimental, Python 3.11.8 embarqué). Citations à corriger : « Unlike Blueprints, the Python environment is only available in the Unreal Editor, not when your Project is running in the Unreal Engine in any mode, including Play In Editor, Standalone Game, cooked executable, etc. » et « you cannot currently use it as a gameplay scripting language. » Le mot « currently » manquait. |
| U8.5 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/using-perforce-as-source-control-for-unreal-engine?application_version=5.8 | Page 5.8, citation exacte. |
| U8.6 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/source-control-in-unreal-engine?application_version=5.8 ; page Perforce | « Check Out : Checks out (locks) the asset for editing. This prevents other users from editing the asset at the same time. » |
| U8.7 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/resources-for-scaling-your-unreal-engine-team?application_version=5.8 | « UE supports the following version control integrations: Perforce, Git with GitLFS, Subversion, Diversion … All of them are acceptable, but Epic Games primarily uses Perforce ». La page Source Control (5.8) dit toujours « Perforce and SVN are supported by default. » |
| U8.8 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/API/PluginIndex/GitSourceControl?application_version=5.8 | Bandeau Beta ; étiquettes « beta », « enabledbydefault » ; chemin « Engine\Plugins\Developer\GitSourceControl ». |
| U8.9 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/one-file-per-actor-in-unreal-engine?application_version=5.8 | Citations exactes. Aussi lu : « The One File Per Actor feature is only available in the Editor. All Actors are embedded in their respective Level files when cooked. » |

## U9 — Licence et redevance

| Id | Verdict | URL relue | Remarque |
|---|---|---|---|
| U9.1 | CONFIRMÉ | https://www.unrealengine.com/en-US/license | Citation exacte, texte complet : « …sur toute la durée de vie du produit et directement attribuable au produit de l'UE, quelles que soient la ou les entités qui le perçoivent, est soumis à une redevance de 5%. » Le CLUF n'a pas été lu. |
| U9.2 | CONFIRMÉ | même page | Citation exacte. La FAQ embarquée dans la page précise : « Les revenus générés sur l'Epic Games Store sont également exclus du calcul de la redevance dans le cas où Epic traite ces paiements. » |
| U9.3 | CONFIRMÉ | même page (FAQ embarquée dans le code de la page) | « À compter du 1er janvier 2025, le taux de redevance est susceptible de passer de 5% à 3,5% des revenus supérieurs à 1 million de dollars (USD) si vous publiez votre jeu sur l'Epic Games Store avant de le publier sur d'autres boutiques ou à la même date. » |
| U9.4 | CONFIRMÉ | même page | « Une fois votre application ou votre jeu livrés, veuillez nous envoyer le Formulaire de notification de sortie. Par la suite, vous devrez déclarer votre redevance chaque trimestre. » ; FAQ : « Le paiement des redevances est dû 45 jours après la fin de chaque trimestre civil. » |
| U9.5 | CORRIGÉ | même page | Texte corrigé : « L'abonnement par poste (affiché à 1 850 $ US par poste et par an lors de ma lecture) ne concerne pas les jeux vendus à des utilisateurs finaux. » Le montant « 2 067,60 € » n'apparaît nulle part dans la page telle que je l'ai lue (aucun symbole € dans le texte ni dans le code) ; il dépend peut-être de la région ou des taxes affichées. La citation « vous serez soumis à une redevance et vous n'avez pas besoin d'acheter de postes » est exacte. |

## U10 — Exécution sans affichage et tests

| Id | Verdict | URL relue | Remarque |
|---|---|---|---|
| U10.1 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/setting-up-dedicated-servers-in-unreal-engine?application_version=5.8 | Citations exactes. Nuance : l'exigence est formulée comme prérequis du tutoriel (« To follow the steps in this tutorial, your project needs to satisfy the following requirements »). Aucune occurrence de « Linux » ni « Mac » ; procédure Visual Studio / Win64. |
| U10.2 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-command-line-arguments-reference?application_version=5.8 | Citation exacte. |
| U10.3 | CONFIRMÉ | même page | « unattended : Run in unattended mode. Unattended applications are not monitored by anyone and are unable to receive user input. » ; « stdout : Use stdout for log output. » ; « RenderOffScreen : Render off screen. » ; « ExecCmds : Execute the specified console commands. » ; « NOSPLASH : Disable splash screen. » |
| U10.4 | CONFIRMÉ | même page | Citations exactes. La conséquence « plus vite ou plus lentement que le temps réel » est une déduction du premier rapport, non lue sur la page. |
| U10.5 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/command-line-arguments-in-unreal-engine?application_version=5.8 | Page 5.8 : exemple « UnrealEditor.exe MyGame.uproject /Game/Maps/BonusMaps/BonusMap.umap -server -port=7777 -log » ; « -server: Run the editor as a dedicated server. » |
| U10.6 | CORRIGÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/automation-test-framework-in-unreal-engine?application_version=5.8 | Texte corrigé : « Le cadre de tests d'automatisation sert aux tests unitaires, aux tests de fonctionnalité et aux tests de résistance du contenu (« unit, feature, and content stress tests ») ; il repose sur le Functional Testing Framework, conçu pour les tests au niveau gameplay. » « Tests de charge » ne correspond pas à « content stress tests ». La page ajoute : « Relies on Unreal Engine systems to work properly, so it is not ideal for pure unit testing. See Low-Level Tests ». |
| U10.7 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/configure-automation-tests-in-unreal-engine?application_version=5.8 | Citation exacte ; « you can reference a test group with Group:<GroupName> in the ExecCmds argument and in Gauntlet. » La syntaxe complète de la commande n'est pas donnée par la page. |
| U10.8 | CONFIRMÉ | https://dev.epicgames.com/documentation/en-us/unreal-engine/running-gauntlet-tests-in-unreal-engine?application_version=5.8 | Citation exacte ; exemples « RunUAT RunUnreal … -platform=Win64 » et « RunUAT.bat RunUnreal -test=UE.EditorAutomation -runtest=Mytest.one -project=<path to uproject> -build=editor ». Aucune occurrence de « Mac », « Linux » ni « nullrhi ». |

---

## Faits utilisables tels quels

Confirmés seulement ; les URL de documentation sont à lire avec `?application_version=5.8`.

Version et calendrier
- La 5.8 a été annoncée par Epic le 17 juin 2026 sur le forum officiel. https://forums.unrealengine.com/t/unreal-engine-5-8-released/2729274
- L'article d'Epic sur la 5.8 est daté du 23 juin 2026. https://www.unrealengine.com/en-US/news/unreal-engine-5-8-is-now-available
- Le correctif 5.8.4 a été annoncé le 20 octobre 2026. https://forums.unrealengine.com/t/5-8-4-hotfix-released/2842775
- Une « 5.9 MegaJam Preview » a été publiée le 9 novembre 2026 ; Epic parle d'une 5.9 « next year » et qualifie les Preview d'instables. https://forums.unrealengine.com/t/unreal-engine-5-9-megajam-preview/2852840
- En juin 2026, Epic ne prévoyait pas d'autre version officielle d'UE5 après la 5.8 tout en se réservant une 5.9 ; UE6 est visé en accès anticipé fin 2027, version complète 12 à 18 mois plus tard ; acteurs et Blueprints seront présents dans les premières versions d'UE6 puis abandonnés, avec outils de conversion. https://www.unrealengine.com/en-US/news/the-road-to-ue-6

macOS
- Éditeur 5.8 : macOS Sonoma 14.5 minimum ; Xcode 26.0 minimum, 26.1.1 recommandé, 26.4 incompatible ; M3 recommandé, M1 ou M2 minimum selon le rendu ; 16 Go minimum, 32 Go recommandés ; éditeur distribué en binaires universels. https://dev.epicgames.com/documentation/en-us/unreal-engine/macos-development-requirements-for-unreal-engine
- Sur Mac : Nanite et Virtual Shadow Maps en « Beta support » (M2+), Lumen ray tracing matériel et MegaLights en « Experimental support » (M2+), Lumen logiciel dès M1. Même URL.
- Les notes de version 5.8 donnent pour macOS Xcode 15.2 / 15.4 et Sonoma 14.0, en contradiction avec la page des prérequis. https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-5-8-release-notes
- La page Nanite ne cite que DirectX 12 / SM6 comme plateformes et ne mentionne pas le Mac. https://dev.epicgames.com/documentation/en-us/unreal-engine/nanite-virtualized-geometry-in-unreal-engine

Multiplateforme
- La compilation croisée vers Linux n'est prise en charge que depuis Windows ; un Mac doit compiler nativement, donc pas de binaire Linux depuis le Mac. Cible prise en charge : Linux x86_64 ; chaîne v26 fondée sur clang 20.1.8 ; Ubuntu 22.04 ou Rocky Linux 8. https://dev.epicgames.com/documentation/en-us/unreal-engine/linux-development-requirements-for-unreal-engine
- Outillage Windows documenté en 5.8 : Visual Studio 2026 recommandé, 2022 v17.14 minimum. https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-5-8-release-notes

Mass
- MassEntity est un module Runtime (`/Engine/Source/Runtime/MassEntity/`) ; sa page de documentation n'a pas de bandeau mais porte l'étiquette « experimental ». https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/MassEntity
- La 5.8 refond Mass et ajoute un module MassCore, sans annonce de changement de statut. https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-5-8-release-notes
- Les plugins MassGameplay, MassAI et MassCrowd portent le bandeau Experimental en 5.8. https://dev.epicgames.com/documentation/en-us/unreal-engine/API/PluginIndex/MassGameplay ; https://dev.epicgames.com/documentation/en-us/unreal-engine/API/PluginIndex/MassAI ; https://dev.epicgames.com/documentation/en-us/unreal-engine/API/PluginIndex/MassCrowd
- Mass Avoidance porte le bandeau Experimental en 5.8. https://dev.epicgames.com/documentation/en-us/unreal-engine/mass-avoidance-in-unreal-engine
- La réplication Mass est documentée comme expérimentale et à sens unique serveur vers clients. https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-mass-gameplay-in-unreal-engine
- Un membre du personnel d'Epic (étiquette Staff) a écrit le 1er juin 2026 que les améliorations de réplication Mass n'arriveraient vraisemblablement pas à temps pour la 5.8. https://forums.unrealengine.com/t/massai-replication-state-in-5-7-and-future-roadmap/2684012
- Les collections MetaHuman (expérimentales, 5.8) visent des foules de centaines à milliers de personnages et s'appuient sur Mass pour l'orchestration. https://www.unrealengine.com/en-US/news/unreal-engine-5-8-is-now-available
- La 5.9 Preview ajoute un plugin « Mass Characters ». https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-5-9-release-notes

Navigation
- Le navmesh est généré depuis la géométrie de collision et découpé en tuiles ; trois modes de génération (Static par défaut, Dynamic, Dynamic Modifiers Only). https://dev.epicgames.com/documentation/en-us/unreal-engine/navigation-system-in-unreal-engine ; https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-how-to-modify-the-navigation-mesh-in-unreal-engine
- Les Navigation Invokers génèrent le navmesh autour de l'agent à l'exécution. https://dev.epicgames.com/documentation/en-us/unreal-engine/using-navigation-invokers-in-unreal-engine
- RVO est limité à la classe Character et n'utilise pas le navmesh ; le Detour Crowd Manager a un nombre maximal d'agents fixé dans les réglages du projet et fonctionne avec toute classe Pawn ; les deux systèmes s'utilisent l'un à l'exclusion de l'autre. https://dev.epicgames.com/documentation/en-us/unreal-engine/using-avoidance-with-the-navigation-system-in-unreal-engine
- 5.8 : zones praticables définies par maillage ; 5.9 Preview : construction progressive du navmesh. URL des notes de version ci-dessus.

Réseau et déterminisme
- Architecture client-serveur à serveur autoritaire ; modes Standalone, Dedicated Server, Listen Server, Client ; réplication générique par défaut. https://dev.epicgames.com/documentation/en-us/unreal-engine/networking-overview-for-unreal-engine
- Iris : « production-ready for licensees » selon les notes 5.8, bandeau Experimental sur sa page 5.8. https://dev.epicgames.com/documentation/en-us/unreal-engine/iris-replication-system-in-unreal-engine
- La page de vue d'ensemble réseau ne contient ni « lockstep », ni « determinism », ni « peer-to-peer ». Même URL que la première ligne.
- La physique asynchrone « improves the determinism » (sans garantie) ; elle introduit un délai possible entre le fil de jeu et la physique. https://dev.epicgames.com/documentation/en-us/unreal-engine/physics-in-unreal-engine ; https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-5-migration-guide
- Substepping, Substepping Async, Tick Physics Async et Async Fixed Time Step Size sont marqués expérimentaux. https://dev.epicgames.com/documentation/en-us/unreal-engine/physics-settings-in-the-unreal-engine-project-settings
- Pas fixe global : réglage « Use Fixed Frame Rate » ; options `-UseFixedTimeStep`, `-FPS`, `-FixedSeed`, `-Deterministic`. https://dev.epicgames.com/documentation/en-us/unreal-engine/general-engine-settings-in-the-unreal-engine-project-settings ; https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-command-line-arguments-reference
- La physique en réseau est conçue pour des acteurs à autorité serveur. https://dev.epicgames.com/documentation/en-us/unreal-engine/networked-physics-overview

Foules animées
- Animation Budget Allocator : plugin sans bandeau de statut, qui bride dynamiquement le tick d'animation des Skeletal Mesh. https://dev.epicgames.com/documentation/en-us/unreal-engine/animation-budget-allocator-in-unreal-engine
- AnimToTexture est Experimental (`Engine\Plugins\Experimental`). https://dev.epicgames.com/documentation/en-us/unreal-engine/API/PluginIndex/AnimToTexture
- Les LOD de Skeletal Mesh se génèrent dans l'éditeur (plugin Skeletal Mesh Reduction). https://dev.epicgames.com/documentation/en-us/unreal-engine/skeletal-mesh-lods-in-unreal-engine
- Nanite gère les Skeletal Mesh (LOD d'animation, instanciation par animation banks) mais pas les morph targets. URL Nanite ci-dessus.

Langages et versionnement
- C++ et Blueprints sont documentés comme voies de programmation du gameplay. https://dev.epicgames.com/documentation/en-us/unreal-engine/programming-with-cplusplus-in-unreal-engine ; https://dev.epicgames.com/documentation/en-us/unreal-engine/blueprints-visual-scripting-in-unreal-engine
- Les fichiers .uasset et .umap sont binaires et non fusionnables en texte ; l'éditeur verrouille par extraction. https://dev.epicgames.com/documentation/en-us/unreal-engine/using-perforce-as-source-control-for-unreal-engine ; https://dev.epicgames.com/documentation/en-us/unreal-engine/source-control-in-unreal-engine
- Intégrations prises en charge : Perforce, Git avec Git LFS, Subversion, Diversion ; Epic utilise surtout Perforce. https://dev.epicgames.com/documentation/en-us/unreal-engine/resources-for-scaling-your-unreal-engine-team
- Le plugin Git de l'éditeur est en Beta, activé par défaut. https://dev.epicgames.com/documentation/en-us/unreal-engine/API/PluginIndex/GitSourceControl
- One File Per Actor : un fichier externe par acteur, activé par défaut avec World Partition, éditeur seulement. https://dev.epicgames.com/documentation/en-us/unreal-engine/one-file-per-actor-in-unreal-engine

Licence
- Redevance de 5 % sur le revenu brut au-delà de 1 million de dollars US sur la durée de vie du produit ; ventes Epic Games Store exemptées ; taux susceptible de passer à 3,5 % en cas de sortie sur l'EGS avant ou en même temps que les autres boutiques (depuis le 1er janvier 2025) ; formulaire de notification de sortie puis déclaration trimestrielle, paiement dû 45 jours après chaque trimestre civil. https://www.unrealengine.com/en-US/license

Sans affichage et tests
- Serveur dédié sans rendu ; le tutoriel officiel exige un moteur compilé depuis les sources et un projet C++, et ne décrit que Windows. https://dev.epicgames.com/documentation/en-us/unreal-engine/setting-up-dedicated-servers-in-unreal-engine
- `-nullrhi`, `-unattended`, `-stdout`, `-RenderOffScreen`, `-ExecCmds`, `-NOSPLASH`, `-UseFixedTimeStep`, `-FPS`, `-FixedSeed`, `-Deterministic` sont documentés pour la 5.8. https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-command-line-arguments-reference
- `-server` lance l'éditeur en serveur dédié. https://dev.epicgames.com/documentation/en-us/unreal-engine/command-line-arguments-in-unreal-engine
- Les tests se référencent par `-ExecCmds="Automation RunTest"`, groupes définis dans DefaultEngine.ini. https://dev.epicgames.com/documentation/en-us/unreal-engine/configure-automation-tests-in-unreal-engine
- Gauntlet se lance par `RunUAT RunUnreal`. https://dev.epicgames.com/documentation/en-us/unreal-engine/running-gauntlet-tests-in-unreal-engine

## Faits à ne pas affirmer

- Qu'on peut, ou qu'on ne peut pas, produire un exécutable Windows depuis un Mac en 5.8 : aucune page officielle actuelle ne le dit (U3.3). Les seules déclarations de personnel d'Epic trouvées datent de 2014 et 2016 et concernent UE4.
- Que « Max Agents » du Crowd Manager vaut 50 par défaut en 5.8 : la documentation est muette ; les sources datent de 2014 à 2016 (U5.6).
- Que la chaîne croisée Linux se présente comme un « installeur .exe » : non lu sur la page (U3.2).
- Que l'abonnement par poste coûte 2 067,60 € : montant non retrouvé ; j'ai lu 1 850 $ US par poste et par an (U9.5).
- Que Verse « n'est pas proposé dans UE5 » : l'article ne parle que du flux UE6 (U8.2).
- Que James Keeling est une « source secondaire » : c'est un compte Staff d'Epic (U4.8, U4.9). À l'inverse, ne pas présenter ses propos comme une position officielle datée d'aujourd'hui : avril 2025 et juin 2026.
- Que Mass n'aura jamais de prise en charge Blueprint : la déclaration date d'avril 2025 et dit « currently » (U4.9).
- Qu'un plugin de réplication Mass via Iris existe dans UE6 mais pas dans UE5 : seuls des utilisateurs du forum le disent.
- Que le cadre d'automatisation fait des « tests de charge » : la page parle de « content stress tests » et précise qu'il n'est pas idéal pour du test unitaire pur (U10.6).
- Que Python « ne peut pas » servir de langage de gameplay, sans nuance : la page écrit « cannot currently » (U8.4).
- Quelle version de Xcode fait foi pour compiler la 5.8 sur Mac : trois chiffres officiels coexistent (26.0 / 26.1.1 sur la page macOS, 15.2 / 15.4 dans la section macOS des notes 5.8, 16.1 sur la ligne de la ferme de compilation).
- Quelle version de macOS est « recommandée » : la même page écrit Sequoia 14 et Sequoia 15.
- Qu'Iris est stabilisé : notes 5.8 « production-ready », page de documentation 5.8 « Experimental ».
- Que la documentation d'Unreal, dans son ensemble, ignore le lockstep et le pair-à-pair : l'absence n'est établie que sur deux pages (U6.4).
- Que le déterminisme est garanti, entre exécutions ou entre machines et plateformes : la documentation dit seulement « improves ».
- Que C++ et Blueprints sont « les deux seules » voies : aucune page ne le formule ainsi (U8.1).
- Qu'aucun 5.8.5 n'existe : je n'en ai pas vu, sans preuve d'absence.
- Qu'un serveur dédié est impossible sous Linux ou macOS : le tutoriel est muet, il ne l'exclut pas.
- Que les tests d'automatisation tournent sous `-nullrhi` : combinaison non documentée dans les pages lues.
- Tout chiffre de capacité (nombre d'agents, de Skeletal Mesh ou d'entités Mass tenables sur Apple Silicon) : aucune donnée officielle.
- Les conditions contractuelles précises de la redevance : le CLUF n'a pas été lu.
- Les formulations anglaises d'origine des articles de `www.unrealengine.com` : seules les traductions françaises ont été lues.
