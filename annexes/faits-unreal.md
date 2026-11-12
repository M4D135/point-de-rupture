# Faits Unreal Engine — état au 11 novembre 2026

Périmètre : RTS 3D isométrique, ~30 escouades de 4 à 6 personnages (120 à 180 unités) plus quelques véhicules, développé sur macOS Apple Silicon, solo hors ligne d'abord, portage Linux et Windows, multijoueur envisagé plus tard.

## Méthode et limites de lecture

- Sources lues pendant la session uniquement : `dev.epicgames.com/documentation`, `www.unrealengine.com`, `forums.unrealengine.com` (annonces du compte Staff « Flak »). Rien n'est complété de mémoire.
- Deux modes de lecture, indiqués à chaque ligne :
  - **[N]** = page ouverte dans un navigateur, texte brut extrait, citation copiée telle quelle ;
  - **[F]** = page lue par WebFetch (extraction par un petit modèle, citation demandée mot pour mot ; risque résiduel d'écart de formulation).
- `www.unrealengine.com` répond 403 à WebFetch ; ces pages ont été lues au navigateur, où le site s'affiche en français (citations en français).
- Le sélecteur de version de la documentation affiche par défaut « Unreal Engine 5.9 Documentation » depuis la Preview du 9 novembre ; quand c'était utile, la variante `?application_version=5.8` a été lue.
- Statuts : **VÉRIFIÉ** (source officielle ou primaire lue), **SOURCE SECONDAIRE** (forum communautaire, ou auteur dont le statut Epic n'a pas été vérifié), **NON VÉRIFIÉ**, **NON DOCUMENTÉ** (les pages officielles lues sont muettes).

---

## U1 — Version stable actuelle et suite annoncée

### U1.1 — La dernière version stable est Unreal Engine 5.8, annoncée le 17 juin 2026.
- Statut : VÉRIFIÉ [N] (message du compte « Flak », badge Staff constaté)
- URL : https://forums.unrealengine.com/t/unreal-engine-5-8-released/2729274
- Citation : « We're excited to announce that Unreal Engine 5.8 is now available. »
- Version / date : 5.8 — 17 juin 2026 (16:45, heure locale affichée)
- Conséquence : 5.8 est la base de travail à retenir.

### U1.2 — L'article de presse d'Epic sur la 5.8 est daté du 23 juin 2026 (écart de six jours avec le forum).
- Statut : VÉRIFIÉ [N] — écart de date non expliqué par les pages
- URL : https://www.unrealengine.com/en-US/news/unreal-engine-5-8-is-now-available
- Citation : « 23 juin 2026 — L'Unreal Engine 5.8 est disponible »
- Version / date : 5.8 — 23 juin 2026
- Conséquence : citer « juin 2026 » ; la date exacte de mise à disposition dépend de la source.

### U1.3 — Le dernier correctif lu est le 5.8.4, annoncé le 20 octobre 2026.
- Statut : VÉRIFIÉ [F]
- URL : https://forums.unrealengine.com/t/5-8-4-hotfix-released/2842775
- Citation : « 5.8.4 has dropped with lots of fixes and updates! »
- Version / date : 5.8.4 — 20 octobre 2026
- Conséquence : partir de 5.8.4 (ou plus récent s'il existe ; je n'ai pas vu de 5.8.5).

### U1.4 — Une « 5.9 MegaJam Preview » a été publiée le 9 novembre 2026 ; la 5.9 finale est prévue « l'an prochain ».
- Statut : VÉRIFIÉ [F]
- URL : https://forums.unrealengine.com/t/unreal-engine-5-9-megajam-preview/2852840 et https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-5-9-release-notes (« Last updated 11/9/26 »)
- Citation : « for an eventual 5.9 release next year. » ; « Preview releases are not fully quality-tested, are still under heavy active development »
- Version / date : 5.9 Preview — 9 novembre 2026
- Conséquence : ne pas démarrer sur la 5.9 Preview ; rester en 5.8.

### U1.5 — En juin 2026, Epic ne prévoyait pas d'autre version officielle d'UE5 après la 5.8, tout en se réservant une 5.9.
- Statut : VÉRIFIÉ [N]
- URL : https://www.unrealengine.com/en-US/news/the-road-to-ue-6
- Citation : « nous ne prévoyions pas actuellement une autre version officielle de l'UE5 après la 5.8, nous nous réservons la possibilité de publier une version 5.9 »
- Version / date : article du 22 juin 2026
- Conséquence : la branche UE5 est en fin de cycle ; la 5.8 (puis éventuellement 5.9) sera la dernière base UE5.

### U1.6 — Unreal Engine 6 : accès anticipé visé fin 2027, version complète 12 à 18 mois plus tard.
- Statut : VÉRIFIÉ [N]
- URL : https://www.unrealengine.com/en-US/news/the-road-to-ue-6
- Citation : « Nous visons une sortie en accès anticipé de l'Unreal Engine 6 fin 2027, la sortie complète de l'UE6 intervenant 12 à 18 mois plus tard. »
- Version / date : article du 22 juin 2026
- Conséquence : un projet lancé aujourd'hui sortira vraisemblablement sur UE5 ; prévoir une migration UE6 comme un risque de moyen terme, pas comme une cible.

---

## U2 — Développer sur macOS

### U2.1 — UE 5.8 exige macOS Sonoma 14.5 au minimum pour faire tourner l'éditeur ; macOS Sequoia 15 est recommandé.
- Statut : VÉRIFIÉ [N] (incohérence interne : le tableau matériel écrit « Latest macOS Sequoia 14 », l'historique écrit « Latest macOS Sequoia 15 »)
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/macos-development-requirements-for-unreal-engine?application_version=5.8
- Citation : ligne 5.8 de l'historique : « Sonoma 14.5 — Latest macOS Sequoia 15 — Xcode 26.0 — Xcode 26.1.1 »
- Version / date : 5.8
- Conséquence : vérifier la version de macOS du poste avant installation.

### U2.2 — Pour compiler en 5.8 : Xcode 26.0 minimum, 26.1.1 recommandé ; Xcode 26.4 est incompatible.
- Statut : VÉRIFIÉ [N]
- URL : même page que U2.1
- Citation : « Xcode 26.4 is not compatible with Unreal Engine. »
- Version / date : 5.8
- Conséquence : figer Xcode sur 26.1.1 et bloquer sa mise à jour automatique.

### U2.3 — Les notes de version 5.8 donnent d'autres chiffres pour macOS (Xcode 15.2 / 15.4, Sonoma 14.0) : contradiction entre deux pages officielles.
- Statut : VÉRIFIÉ [N] (la contradiction est constatée ; je ne sais pas laquelle des deux pages fait foi)
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-5-8-release-notes?application_version=5.8 (section Platform SDK Upgrades)
- Citation : « Recommended Xcode: 15.4 or newer — Minimum Xcode: 15.2 » ; « Supported Xcode versions were downgraded from UE 5.6 »
- Version / date : 5.8
- Conséquence : tester la compilation avec la version de Xcode réellement installée avant tout engagement ; ne pas se fier à une seule page.

### U2.4 — L'éditeur est distribué en binaires universels ; processeur recommandé Apple Silicon M3, minimum M1 ou M2 selon les fonctions de rendu, 16 Go minimum, 32 Go recommandés.
- Statut : VÉRIFIÉ [N]
- URL : même page que U2.1
- Citation : « Unreal Editor is distributed with universal binaries for macOS through the Epic Games Launcher. »
- Version / date : mention introduite à la ligne 5.2–5.3 de l'historique, page 5.8
- Conséquence : Apple Silicon est une cible native ; les plugins de code doivent aussi être universels.

### U2.5 — Sur Mac, Nanite et Virtual Shadow Maps sont en « Beta » (M2+) ; Lumen en ray tracing matériel et MegaLights sont « Experimental » (M2+) ; Lumen logiciel fonctionne dès M1.
- Statut : VÉRIFIÉ [N]
- URL : même page que U2.1
- Citation : « Nanite Virtualized Geometry and Virtual Shadow Maps — Apple Silicon M2+ (Beta support). » ; « Apple Sillicon M2+ (Experimental support) »
- Version / date : 5.8
- Conséquence : ne pas faire dépendre le rendu du jeu de Nanite ni du ray tracing matériel si le Mac est la plateforme de développement et de sortie.

### U2.6 — La page Nanite ne cite que DirectX 12 / SM6 pour les plateformes prises en charge et ne mentionne pas le Mac.
- Statut : VÉRIFIÉ [N]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/nanite-virtualized-geometry-in-unreal-engine?application_version=5.8
- Citation : « Nanite supports current console and desktop platforms with graphics cards using the latest drivers with DirectX 12 with Shader Model 6 (SM6). »
- Version / date : 5.8
- Conséquence : le statut Mac de Nanite ne se lit que sur la page des prérequis macOS (U2.5).

---

## U3 — Compilation multiplateforme depuis un Mac

### U3.1 — La compilation croisée vers Linux n'est prise en charge que depuis Windows ; depuis un Mac, non.
- Statut : VÉRIFIÉ [N]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/linux-development-requirements-for-unreal-engine?application_version=5.8
- Citation : « At this time, cross-compiling is only supported for Windows, and Mac users currently have to resort to Native Compiling. »
- Version / date : 5.8 (texte identique sur la page 5.9)
- Conséquence : le binaire Linux ne sortira pas du Mac ; il faut un hôte Linux natif ou un hôte Windows.

### U3.2 — Hôtes prévus pour Linux : Windows (chaîne croisée v26, clang 20.1.8, installeur .exe) ou Linux natif (Ubuntu 22.04 ou Rocky Linux 8, clang 20.1.8) ; cible prise en charge : Linux x86_64.
- Statut : VÉRIFIÉ [N] pour les phrases, [F] pour le tableau des chaînes d'outils
- URL : même page que U3.1
- Citation : « we support, test, and provide libraries and toolchains for the Linux-x86_64 platform. »
- Version / date : 5.7–5.8 (même ligne du tableau)
- Conséquence : un seul poste Windows peut produire Windows et Linux ; à défaut, deux machines (ou une CI) sont nécessaires.

### U3.3 — Produire un exécutable Windows depuis un Mac : aucune page officielle lue ne le prévoit ni ne l'exclut explicitement.
- Statut : NON DOCUMENTÉ (page d'empaquetage muette sur l'hôte) ; indice SOURCE SECONDAIRE : un fil de forum de mai 2025 où un utilisateur dit ne pas pouvoir exporter pour Windows depuis son Mac, sans réponse d'Epic
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/packaging-your-project?application_version=5.8 ; https://forums.unrealengine.com/t/package-a-game-for-windows-on-a-mac/2495448
- Citation : « Developing and packaging for Windows and macOS does not require any additional software. » [F] ; forum : « What i can't do it exporting for windows on my mac. » [F]
- Version / date : 5.8 ; forum 7 mai 2025
- Conséquence : considérer qu'un hôte Windows est requis pour le binaire Windows, et le vérifier par un essai réel avant de planifier.

### U3.4 — La chaîne Windows documentée repose sur Visual Studio (2026 recommandé, 2022 v17.14 minimum).
- Statut : VÉRIFIÉ [F]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-5-8-release-notes?application_version=5.8
- Citation : « Recommended Visual Studio: 2026 » ; « Minimum Visual Studio: 2022 v17.14 or newer »
- Version / date : 5.8
- Conséquence : l'outillage Windows officiel n'existe que sous Windows.

---

## U4 — Mass (MassEntity, MassGameplay, MassAI, Mass Crowd)

### U4.1 — MassEntity est un module Runtime du moteur ; ses pages de documentation ne portent pas de bandeau de statut, seulement l'étiquette « experimental ».
- Statut : VÉRIFIÉ [N] pour la page de documentation, [F] pour la page d'API
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/mass-entity-in-unreal-engine?application_version=5.8 ; https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/MassEntity?application_version=5.8
- Citation : « MassEntity is a gameplay-focused framework for data-oriented calculations. » ; emplacement : « /Engine/Source/Runtime/MassEntity/ »
- Version / date : 5.8
- Conséquence : le cœur ECS est dans le moteur, mais Epic n'écrit nulle part qu'il est « production-ready ».

### U4.2 — La 5.8 refond Mass (ordonnancement multi-cœur, fragments épars, nouveau module MassCore) sans annoncer de changement de statut.
- Statut : VÉRIFIÉ [N]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-5-8-release-notes?application_version=5.8
- Citation : « A new MassCore module further simplifies adoption by separating the core entity system from the broader MassGameplay stack. »
- Version / date : 5.8
- Conséquence : l'API Mass bouge encore d'une version à l'autre ; coût de maintenance à prévoir.

### U4.3 — Le plugin MassGameplay est « Experimental ».
- Statut : VÉRIFIÉ [F]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/API/PluginIndex/MassGameplay?application_version=5.8
- Citation : « Learn to use this Experimental feature, but use caution when shipping with it. » ; description : « Implementation of large-scale agent simulation based on MassEntity »
- Version / date : 5.8
- Conséquence : Epic déconseille implicitement de livrer un jeu qui en dépend sans précaution.

### U4.4 — Le plugin MassAI est « Experimental ».
- Statut : VÉRIFIÉ [F]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/API/PluginIndex/MassAI?application_version=5.8
- Citation : « AI-specific functionality extending MassGameplay » (même bandeau Experimental que U4.3)
- Version / date : 5.8 ; dépendances listées : MassGameplay, ZoneGraph, ZoneGraph Annotations, SmartObjects, StateTree, NavCorridor
- Conséquence : l'IA de masse tire toute une pile de plugins eux-mêmes non stabilisés.

### U4.5 — Le plugin MassCrowd est « Experimental » et décrit comme un système de foule basé sur des splines (ZoneGraph).
- Statut : VÉRIFIÉ [F]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/API/PluginIndex/MassCrowd?application_version=5.8
- Citation : « Spline based AI crowd system » (même bandeau Experimental)
- Version / date : 5.8
- Conséquence : MassCrowd vise des piétons d'ambiance sur voies prédéfinies, pas des unités de RTS commandées librement.

### U4.6 — Mass Avoidance est « Experimental ».
- Statut : VÉRIFIÉ [F]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/mass-avoidance-in-unreal-engine
- Citation : « Mass Avoidance is a force-based avoidance system integrated with MassEntity. »
- Version / date : page 5.9 (bandeau Experimental)
- Conséquence : même réserve que U4.3 pour l'évitement.

### U4.7 — La réplication Mass est décrite comme expérimentale (texte daté de la 5.1, toujours en ligne) et à sens unique serveur vers clients.
- Statut : VÉRIFIÉ [F] (texte ancien conservé sur la page 5.9)
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-mass-gameplay-in-unreal-engine
- Citation : « Mass Replication is considered experimental for Unreal Engine 5.1. »
- Version / date : page 5.9, texte daté 5.1
- Conséquence : ne pas compter sur Mass pour le multijoueur futur.

### U4.8 — D'après un intervenant se présentant comme membre de l'équipe Mass, la réplication Mass via Iris n'est pas arrivée en 5.8 et il n'y a pas de calendrier de passage en bêta ou en production.
- Statut : SOURCE SECONDAIRE [F] (forum officiel, auteur « James.Keeling », badge Staff non vérifié)
- URL : https://forums.unrealengine.com/t/massai-replication-state-in-5-7-and-future-roadmap/2684012 ; https://forums.unrealengine.com/t/mass-entity-roadmap-vision-and-more-questions/2527030
- Citation : « Replication improvements are in development but unlikely to land in time for 5.8. » ; « I do not know that we have any ETA for when plugins may become production-ready or beta. »
- Version / date : 1er juin 2026 ; 25 avril 2025
- Conséquence : aucune date de stabilisation à inscrire dans un planning.

### U4.9 — Selon le même intervenant, Mass n'a pas de prise en charge Blueprint prévue, et BehaviorTree / GAS ne seront probablement pas portés.
- Statut : SOURCE SECONDAIRE [F]
- URL : https://forums.unrealengine.com/t/mass-entity-roadmap-vision-and-more-questions/2527030
- Citation : « There are not plans for BP currently as it would negate all of the performance gains of Mass. »
- Version / date : 25 avril 2025
- Conséquence : Mass implique du C++ et une logique de jeu réécrite hors du framework Acteur.

### U4.10 — Usage affiché par Epic : orchestration de foules de centaines à milliers de personnages (MetaHuman Collections, ressource expérimentale en 5.8).
- Statut : VÉRIFIÉ [N]
- URL : https://www.unrealengine.com/en-US/news/unreal-engine-5-8-is-now-available
- Citation : « un nouveau processus de création de foule qui s'appuie également sur Mass pour l'orchestration de la foule »
- Version / date : 5.8 — article du 23 juin 2026
- Conséquence : l'échelle visée par Mass (milliers) dépasse de loin 120–180 unités ; Mass n'est pas requis par l'échelle du projet.

### U4.11 — La 5.9 Preview ajoute un plugin « Mass Characters » (interpolation et visualisation de personnages).
- Statut : VÉRIFIÉ [F]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-5-9-release-notes
- Citation : « The new Mass Characters plugin brings Mass traits for character interpolation and visualization »
- Version / date : 5.9 Preview, 9 novembre 2026 ; aucun statut indiqué
- Conséquence : à surveiller, pas à utiliser (Preview).

---

## U5 — Navigation

### U5.1 — Le système de navigation génère un navmesh à partir de la géométrie de collision ; l'acteur par défaut s'appelle RecastNavMesh-Default.
- Statut : VÉRIFIÉ [F]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/navigation-system-in-unreal-engine ; https://dev.epicgames.com/documentation/en-us/unreal-engine/basic-navigation-in-unreal-engine
- Citation : « The Unreal Engine Navigation System allows artificial intelligence Agents to navigate the Level using pathfinding. »
- Version / date : pages 5.9
- Conséquence : la recherche de chemin de base est fournie et stable ; pas de bandeau de statut.

### U5.2 — Trois modes de génération : Static, Dynamic, Dynamic Modifiers Only ; en Dynamic, seules les tuiles touchées sont régénérées.
- Statut : VÉRIFIÉ [F]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-how-to-modify-the-navigation-mesh-in-unreal-engine
- Citation : « The Navigation System includes three Generation Modes: Static, Dynamic, and Dynamic Modifiers Only. » ; « can result in up to 50% cheaper processing of the affected tiles. »
- Version / date : page 5.9
- Conséquence : bâtiments construits ou détruits en jeu : « Dynamic Modifiers Only » suffit si le sol ne change pas, « Dynamic » sinon.

### U5.3 — Les Navigation Invokers génèrent le navmesh autour des agents à l'exécution.
- Statut : VÉRIFIÉ [F]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/using-navigation-invokers-in-unreal-engine
- Citation : « Blueprint Actor components that generate the Navigation Mesh around the Agent at runtime. »
- Version / date : page 5.9
- Conséquence : utile seulement pour de très grandes cartes ; pas nécessaire pour une carte de RTS bornée.

### U5.4 — L'évitement RVO est limité à la classe Character et n'utilise pas le navmesh : les agents peuvent sortir des zones navigables.
- Statut : VÉRIFIÉ [N]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/using-avoidance-with-the-navigation-system-in-unreal-engine?application_version=5.8
- Citation : « Does not use the Navigation Mesh for avoidance so Agents can potentially go "out of bounds". »
- Version / date : 5.8
- Conséquence : RVO convient mal aux véhicules (non Character) et aux passages étroits.

### U5.5 — Le Detour Crowd Manager a un nombre maximal d'agents fixé dans les réglages du projet, et ne doit pas être combiné avec RVO.
- Statut : VÉRIFIÉ [N]
- URL : même page que U5.4
- Citation : « Has a fixed maximum number of Agents defined in the project settings. » ; « Both systems work independently and should be used exclusively in your project. »
- Version / date : 5.8
- Conséquence : choisir un seul des deux systèmes ; dimensionner Max Agents au-dessus du nombre total d'unités.

### U5.6 — La valeur par défaut de « Max Agents » n'est pas indiquée par la documentation officielle ; un fil de forum de 2016 parle de 50.
- Statut : NON DOCUMENTÉ pour la valeur ; SOURCE SECONDAIRE pour « 50 » (utilisateur anonyme, 2016, version de moteur ancienne)
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/crowd-manager-settings-in-the-the-unreal-engine-project-settings ; https://forums.unrealengine.com/t/detour-crowd-ai-controller-can-not-simulate-a-big-crowd/372860
- Citation : officiel : « Maximum number of agents supported by crowd. » [F] ; forum : « There is a variable for max AI characters preset to 50. » [F]
- Version / date : page 5.9 ; forum 11 octobre 2016
- Conséquence : lire la valeur réelle dans Project Settings > Crowd Manager en 5.8 ; avec 120–180 unités, elle devra de toute façon être relevée.

### U5.7 — Nouveautés récentes : zones praticables par maillage (5.8) ; construction progressive du navmesh (5.9 Preview).
- Statut : VÉRIFIÉ [N] pour 5.8, [F] pour 5.9
- URL : notes de version 5.8 et 5.9 (voir U1.4, U4.2)
- Citation : « Static meshes can now define their own walkable areas during navmesh generation » ; « The Navmesh can now build progressively, with control over how many tiles build per tick »
- Version / date : 5.8 ; 5.9 Preview
- Conséquence : améliorations de confort, sans effet sur le choix d'architecture.

---

## U6 — Réseau et déterminisme

### U6.1 — Le modèle réseau officiel est client-serveur à serveur autoritaire, avec réplication d'état du serveur vers les clients.
- Statut : VÉRIFIÉ [N]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/networking-overview-for-unreal-engine?application_version=5.8
- Citation : « UE uses the client-server architecture for networked multiplayer games. » ; « The server, as the host of the game, holds the one, true, authoritative game state. »
- Version / date : 5.8
- Conséquence : le multijoueur « natif » d'Unreal suppose un serveur (dédié ou d'écoute), pas des pairs symétriques.

### U6.2 — Modes réseau : Standalone, Dedicated Server, Listen Server, Client.
- Statut : VÉRIFIÉ [F]
- URL : même page que U6.1 (version 5.9)
- Citation : « A server that also has a local player who is hosting the game. » (Listen Server)
- Version / date : 5.9
- Conséquence : le solo hors ligne correspond au mode Standalone ; un serveur d'écoute permettrait plus tard l'hébergement par un joueur.

### U6.3 — Iris : les notes 5.8 le déclarent « production-ready » pour les licenciés, mais sa page de documentation (5.8 et 5.9) porte toujours le bandeau « Experimental ».
- Statut : VÉRIFIÉ [N] — contradiction entre deux pages officielles
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-5-8-release-notes?application_version=5.8 ; https://dev.epicgames.com/documentation/en-us/unreal-engine/iris-replication-system-in-unreal-engine?application_version=5.8
- Citation : « Iris is now production-ready for licensees in UE 5.8. » ; « Iris is an opt-in replication system that works alongside Unreal Engine's existing replication system. »
- Version / date : 5.8
- Conséquence : Iris est facultatif et reste un système de réplication client-serveur ; à réévaluer au moment d'aborder le multijoueur.

### U6.4 — La documentation réseau ne mentionne aucun mode « lockstep » déterministe ni de modèle pair-à-pair.
- Statut : NON DOCUMENTÉ (recherche des termes « lockstep », « determinis », « peer-to-peer » dans la page de vue d'ensemble : aucune occurrence [N] ; recherche sur dev.epicgames.com : aucune page [recherche web])
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/networking-overview-for-unreal-engine?application_version=5.8
- Citation : aucune (absence constatée sur une page de 23 827 caractères)
- Version / date : 5.8
- Conséquence : un multijoueur RTS en lockstep serait un développement entièrement à la charge du projet, sans appui du moteur.

### U6.5 — Epic affirme que le mode « Asynchronous Physics » améliore le déterminisme de la simulation, sans le garantir ni parler de reproductibilité entre machines.
- Statut : VÉRIFIÉ [N] (phrase située dans la section véhicules Chaos)
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/physics-in-unreal-engine?application_version=5.8
- Citation : « which improves the determinism of the simulation and allows for predictable results every time the simulation runs. »
- Version / date : 5.8
- Conséquence : « améliore » n'est pas « garantit » ; ne pas fonder la logique de jeu sur la physique Chaos si la reproductibilité compte.

### U6.6 — Le guide de migration UE5 lie ce déterminisme au pas fixe de la physique et signale un délai entre le fil de jeu et la physique.
- Statut : VÉRIFIÉ [F]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-5-migration-guide
- Citation : « This change improves determinism by running physical simulation updates at a fixed rate. »
- Version / date : guide de migration UE4 vers UE5 (page 5.9)
- Conséquence : même réserve que U6.5.

### U6.7 — Les réglages « Tick Physics Async », « Async Fixed Time Step Size » et « Substepping » sont marqués expérimentaux.
- Statut : VÉRIFIÉ [F]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/physics-settings-in-the-unreal-engine-project-settings
- Citation : « This feature is still experimental. Certain functionality might not work correctly. »
- Version / date : page 5.9
- Conséquence : le pas fixe de la physique n'est pas un socle stabilisé selon la documentation.

### U6.8 — Le moteur propose un pas de temps fixe global : réglage « Use Fixed Frame Rate » et options `-UseFixedTimeStep`, `-FPS`, `-FixedSeed`, `-Deterministic`.
- Statut : VÉRIFIÉ [N] pour la ligne de commande, [F] pour le réglage
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-command-line-arguments-reference?application_version=5.8 ; https://dev.epicgames.com/documentation/en-us/unreal-engine/general-engine-settings-in-the-unreal-engine-project-settings
- Citation : « Deterministic — Shortcut for -UseFixedTimeStep -FixedSeed. » ; « FixedSeed — Use 0 as the seed for FRandomStream. » ; « Specifies whether to use a fixed framerate. »
- Version / date : 5.8 ; 5.9
- Conséquence : utile pour des tests reproductibles sur une même machine ; la documentation ne promet rien de plus.

### U6.9 — La physique en réseau est conçue autour du serveur autoritaire (modes Default, Predictive Interpolation, Resimulation).
- Statut : VÉRIFIÉ [F]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/networked-physics-overview
- Citation : « The Resimulation replication mode is designed for server-authoritative Pawns and Actors. »
- Version / date : page 5.9 ; ni « determinism » ni « lockstep » sur la page
- Conséquence : confirme U6.1 et U6.4.

---

## U7 — Foules animées

### U7.1 — Animation Budget Allocator : plugin documenté sans bandeau de statut, qui plafonne le temps d'animation en ralentissant dynamiquement les mises à jour.
- Statut : VÉRIFIÉ [F]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/animation-budget-allocator-in-unreal-engine
- Citation : « will dynamically throttle Skeletal Mesh Component animation ticking » ; « you must set the character blueprint's mesh component's Component Class to use the SkeletalMeshComponentBudgeted class »
- Version / date : page 5.9
- Conséquence : outil le plus directement adapté à 120–180 Skeletal Mesh classiques.

### U7.2 — Le plugin AnimToTexture (animation cuite en textures) est « Experimental » et vit dans le dossier des plugins expérimentaux.
- Statut : VÉRIFIÉ [F]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/API/PluginIndex/AnimToTexture?application_version=5.8
- Citation : « Converts SkeletalMesh Animations into Textures » ; chemin : « Engine\Plugins\Experimental\AnimToTexture\AnimToTexture.uplugin »
- Version / date : 5.8
- Conséquence : option de repli pour de très grands nombres, non nécessaire à l'échelle visée, et non stabilisée.

### U7.3 — Les LOD de Skeletal Mesh se génèrent dans l'éditeur avec l'outil de réduction intégré.
- Statut : VÉRIFIÉ [N]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/skeletal-mesh-lods-in-unreal-engine?application_version=5.8
- Citation : « you can generate Skeletal Mesh LOD (Level of Detail) model variants to optimize gameplay. »
- Version / date : 5.8 ; pas de bandeau de statut
- Conséquence : en vue isométrique éloignée, des LOD agressifs sont la première optimisation à appliquer.

### U7.4 — Nanite prend en charge les Skeletal Mesh (LOD d'animation, instanciation par « animation banks »), sans morph targets ; la page ne donne pas de statut, et Nanite reste « Beta » sur Mac.
- Statut : VÉRIFIÉ [N]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/nanite-virtualized-geometry-in-unreal-engine?application_version=5.8
- Citation : « No geometry LODs. Nanite Skeletal Mesh uses animation LODs. » ; « Deformation with Morph Targets is not supported with Nanite. »
- Version / date : 5.8
- Conséquence : à écarter comme dépendance tant que la plateforme principale est le Mac (voir U2.5).

### U7.5 — MetaHuman Collections (5.8, expérimental) bascule les personnages entre acteurs détaillés et maillages instanciés selon la distance.
- Statut : VÉRIFIÉ [N]
- URL : https://www.unrealengine.com/en-US/news/unreal-engine-5-8-is-now-available
- Citation : « les collections MetaHuman, un nouveau type de ressource expérimentale qui vous permet de peupler votre monde en temps réel avec des foules de MetaHumans »
- Version / date : 5.8 — 23 juin 2026
- Conséquence : filière pensée pour des foules de MetaHumans, expérimentale ; hors besoin pour des unités de RTS stylisées.

---

## U8 — Langages, fichiers, versionnement

### U8.1 — C++ et Blueprints sont les deux voies de programmation du jeu documentées pour UE5.
- Statut : VÉRIFIÉ [F]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/programming-with-cplusplus-in-unreal-engine ; https://dev.epicgames.com/documentation/en-us/unreal-engine/blueprints-visual-scripting-in-unreal-engine
- Citation : « Unreal Engine provides a robust framework for C++ programmers to help bring their vision to life. » ; « a complete gameplay scripting system based on the concept of using a node-based interface »
- Version / date : pages 5.9
- Conséquence : la logique de jeu s'écrit en C++ (texte) et/ou en Blueprints (binaire).

### U8.2 — Verse n'est pas proposé pour un usage général dans UE5 ; il sera le socle du nouveau framework de gameplay d'UE6.
- Statut : VÉRIFIÉ [N] pour la feuille de route ; la recherche dans la documentation n'a renvoyé que des pages Verse rattachées à UEFN/Fortnite, aucune à Unreal Engine
- URL : https://www.unrealengine.com/en-US/news/the-road-to-ue-6
- Citation : « L'implémentation du langage Verse a été déplacée pour être visible ici, bien qu'elle ne soit pas destinée à une adoption générale à ce stade. »
- Version / date : 22 juin 2026 (« ici » = flux de développement UE6 sur GitHub)
- Conséquence : ne pas prévoir Verse pour ce projet.

### U8.3 — Acteurs et Blueprints seront présents dans les premières versions d'UE6, puis abandonnés à terme, avec des outils de conversion.
- Statut : VÉRIFIÉ [N]
- URL : https://www.unrealengine.com/en-US/news/the-road-to-ue-6
- Citation : « les acteurs et les blueprints seront présents dans les premières versions de l'UE6. À terme, ces éléments seront abandonnés »
- Version / date : 22 juin 2026
- Conséquence : le framework de jeu actuel a une fin de vie annoncée, sans date ; risque à long terme, pas à l'échelle d'un premier jeu.

### U8.4 — Python ne sert qu'à scripter l'éditeur, pas le jeu ; la page porte un bandeau « Experimental » ; Python embarqué 3.11.8.
- Statut : VÉRIFIÉ [N] pour le bandeau, [F] pour les phrases
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/scripting-the-unreal-editor-using-python?application_version=5.8
- Citation : « the Python environment is only available in Unreal Editor, not when your project is running » ; « you cannot use it as a gameplay scripting language. »
- Version / date : 5.8 / 5.9
- Conséquence : Python convient à l'automatisation des contenus et des tests d'éditeur, pas à la logique de jeu.

### U8.5 — Les assets (.uasset) et les cartes (.umap) sont des fichiers binaires, non fusionnables par un outil de fusion texte.
- Statut : VÉRIFIÉ [F]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/using-perforce-as-source-control-for-unreal-engine
- Citation : « These files are binary, so cannot be opened as text or merged in a text-based merge tool. »
- Version / date : page 5.9
- Conséquence : les Blueprints étant des assets, toute logique en Blueprint est illisible en diff texte et non fusionnable ; mettre en C++ ce qui doit être relu ou fusionné.

### U8.6 — Le flux prévu est le verrouillage par extraction (« check out ») du fichier en cours d'édition.
- Statut : VÉRIFIÉ [F]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/source-control-in-unreal-engine ; page Perforce (U8.5)
- Citation : « Checks out (locks) the asset for editing. » ; « so that other users cannot concurrently edit it. »
- Version / date : page 5.9
- Conséquence : en équipe (ou à plusieurs agents), un asset ne s'édite que par une personne à la fois.

### U8.7 — Intégrations prises en charge : Perforce, Git avec Git LFS, Subversion, Diversion ; Epic utilise principalement Perforce.
- Statut : VÉRIFIÉ [F]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/resources-for-scaling-your-unreal-engine-team
- Citation : « UE supports the following version control integrations: » ; « Epic Games primarily uses Perforce »
- Version / date : page 5.9 (la page « Source Control » plus ancienne dit : « Perforce and SVN are supported by default. »)
- Conséquence : Git + LFS est officiellement admis ; Perforce reste la voie la mieux outillée.

### U8.8 — Le plugin Git de l'éditeur est en « Beta », activé par défaut.
- Statut : VÉRIFIÉ [F]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/API/PluginIndex/GitSourceControl?application_version=5.8
- Citation : « Learn to use this Beta feature, but use caution when shipping with it. »
- Version / date : 5.8
- Conséquence : avec Git, piloter le dépôt depuis la ligne de commande plutôt que de dépendre de l'intégration éditeur.

### U8.9 — « One File Per Actor » enregistre chaque acteur d'un niveau dans un fichier externe ; activé par défaut avec World Partition.
- Statut : VÉRIFIÉ [F]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/one-file-per-actor-in-unreal-engine
- Citation : « The One File Per Actor feature is enabled by default when using World Partition. » ; « reduces overlap between users by saving data for instances of Actors in external files. »
- Version / date : page 5.9
- Conséquence : réduit les conflits sur les cartes, au prix de nombreux petits fichiers binaires dans le dépôt.

---

## U9 — Licence et redevance

### U9.1 — Redevance de 5 % sur le revenu brut au-delà de 1 million de dollars US, calculé par produit sur toute sa durée de vie.
- Statut : VÉRIFIÉ [N] (page Licence ; le texte du CLUF lui-même n'a pas été lu)
- URL : https://www.unrealengine.com/en-US/license
- Citation : « Tout revenu brut supérieur à 1 million de dollars (USD) sur toute la durée de vie du produit […] est soumis à une redevance de 5%. »
- Version / date : page lue le 11 novembre 2026
- Conséquence : aucun coût de licence tant que le jeu n'a pas dépassé 1 M$ de revenu brut cumulé.

### U9.2 — Les ventes réalisées sur l'Epic Games Store sont exemptées de redevance.
- Statut : VÉRIFIÉ [N]
- URL : https://www.unrealengine.com/en-US/license
- Citation : « Les revenus générés par les ventes sur l'Epic Games Store sont exemptés de redevance. »
- Version / date : 11 novembre 2026
- Conséquence : les revenus EGS ne comptent pas dans l'assiette.

### U9.3 — Le taux peut passer de 5 % à 3,5 % si le jeu sort sur l'Epic Games Store avant ou en même temps que sur les autres boutiques (depuis le 1er janvier 2025).
- Statut : VÉRIFIÉ [N] (réponse de la FAQ de la page Licence)
- URL : https://www.unrealengine.com/en-US/license
- Citation : « le taux de redevance est susceptible de passer de 5% à 3,5% des revenus supérieurs à 1 million de dollars (USD) »
- Version / date : en vigueur depuis le 1er janvier 2025 selon la page
- Conséquence : une sortie simultanée sur l'EGS réduit le taux sur les autres boutiques ; « susceptible de » : conditions exactes à lire dans le CLUF.

### U9.4 — Obligations : formulaire de notification de sortie, puis déclaration trimestrielle ; paiement dû 45 jours après chaque trimestre civil.
- Statut : VÉRIFIÉ [N]
- URL : https://www.unrealengine.com/en-US/license
- Citation : « Le paiement des redevances est dû 45 jours après la fin de chaque trimestre civil. »
- Version / date : 11 novembre 2026
- Conséquence : obligation administrative dès la sortie commerciale, même sous le seuil (notification).

### U9.5 — L'abonnement par poste (2 067,60 € par an) ne concerne pas les jeux vendus à des utilisateurs finaux.
- Statut : VÉRIFIÉ [N]
- URL : https://www.unrealengine.com/en-US/license
- Citation : « vous serez soumis à une redevance et vous n'avez pas besoin d'acheter de postes. »
- Version / date : 11 novembre 2026
- Conséquence : pas de coût par poste pour un jeu.

---

## U10 — Exécution sans affichage et tests

### U10.1 — Un serveur dédié tourne sans rendu ; le guide officiel impose une compilation du moteur depuis les sources et un projet C++.
- Statut : VÉRIFIÉ [N]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/setting-up-dedicated-servers-in-unreal-engine?application_version=5.8
- Citation : « A headless server does not render any visuals and nobody is playing locally on the headless server. » ; « You must use a source build of Unreal Engine. »
- Version / date : 5.8 ; le guide ne décrit que la procédure Windows (aucune mention de Linux ni de Mac)
- Conséquence : la cible « Server » coûte une compilation complète du moteur ; inutile pour de simples parties simulées (voir U10.2).

### U10.2 — L'option `-nullrhi` fait tourner le moteur sans interface de rendu.
- Statut : VÉRIFIÉ [N]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-command-line-arguments-reference?application_version=5.8
- Citation : « nullrhi — Use null rendering hardware interface to run UE headless. »
- Version / date : 5.8
- Conséquence : moyen documenté de lancer des parties simulées sans affichage avec l'éditeur ou le jeu installés par le lanceur.

### U10.3 — Options d'accompagnement documentées : `-unattended`, `-stdout`, `-RenderOffScreen`, `-ExecCmds`, `-NOSPLASH`.
- Statut : VÉRIFIÉ [N]
- URL : même page que U10.2
- Citation : « unattended — Run in unattended mode. » ; « stdout — Use stdout for log output. » ; « ExecCmds — Execute the specified console commands. »
- Version / date : 5.8
- Conséquence : de quoi scripter des exécutions non interactives et en récupérer les journaux.

### U10.4 — Pas fixe et graine fixe en ligne de commande : `-UseFixedTimeStep`, `-FPS`, `-FixedSeed`, `-Deterministic`.
- Statut : VÉRIFIÉ [N]
- URL : même page que U10.2
- Citation : « UseFixedTimeStep — Use a fixed time step. » ; « FPS — Override fixed tick rate frames per second. »
- Version / date : 5.8
- Conséquence : combinées à `-nullrhi`, ces options permettent des parties simulées à pas fixe, plus vite ou plus lentement que le temps réel.

### U10.5 — L'option `-server` lance l'éditeur en serveur dédié, sans cible Server compilée.
- Statut : VÉRIFIÉ [F]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/command-line-arguments-in-unreal-engine
- Citation : « Run the editor as a dedicated server. »
- Version / date : page 5.9
- Conséquence : alternative légère pour tester la logique serveur pendant le développement.

### U10.6 — Le cadre de tests d'automatisation couvre tests unitaires, fonctionnels et de charge ; les tests fonctionnels visent le niveau gameplay.
- Statut : VÉRIFIÉ [F]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/automation-test-framework-in-unreal-engine
- Citation : « You can use the Automation Test Framework to perform automated unit, feature, and content stress tests on your project. »
- Version / date : page 5.9
- Conséquence : les règles de jeu peuvent être couvertes par des tests C++ exécutables hors interface.

### U10.7 — Les tests se déclenchent en ligne de commande par `-ExecCmds="Automation RunTest …"`, avec des groupes définis dans DefaultEngine.ini.
- Statut : VÉRIFIÉ [F]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/configure-automation-tests-in-unreal-engine
- Citation : « You can refer to them through the command line argument -ExecCmds="Automation RunTest" »
- Version / date : page 5.9 ; le guide utilisateur de l'automatisation ne donne, lui, aucun exemple en ligne de commande
- Conséquence : intégrable dans un script ou une CI ; la syntaxe complète est à valider par essai.

### U10.8 — Gauntlet est le cadre officiel pour lancer des sessions du projet (client, serveur, éditeur) et valider des résultats, via `RunUAT RunUnreal`.
- Statut : VÉRIFIÉ [F]
- URL : https://dev.epicgames.com/documentation/en-us/unreal-engine/running-gauntlet-tests-in-unreal-engine
- Citation : « The main Gauntlet command to trigger UE tests is RunUnreal. »
- Version / date : page 5.9 ; exemple donné pour Win64
- Conséquence : outil adapté aux parties simulées de bout en bout, plus lourd à mettre en place que `-nullrhi` + tests d'automatisation.

---

## Ce que je n'ai pas pu établir

1. **Compilation Windows depuis un Mac** : aucune page officielle lue ne l'autorise ni ne l'interdit explicitement (U3.3). Seul un fil de forum sans réponse d'Epic va dans le sens du « non ».
2. **Valeur par défaut de « Max Agents » du Crowd Manager en 5.8** : absente de la documentation ; le « 50 » vient d'un message de forum anonyme de 2016. Le code source du moteur (dépôt GitHub privé) n'a pas été consulté.
3. **Version de Xcode réellement requise pour compiler la 5.8 sur Mac** : deux pages officielles se contredisent (26.0/26.1.1 contre 15.2/15.4) ; je ne sais pas laquelle fait foi.
4. **Statut réel d'Iris** : « production-ready » dans les notes 5.8, « Experimental » sur sa page de documentation 5.8 et 5.9.
5. **Statut officiel de MassEntity lui-même** : aucun bandeau sur ses pages ; seuls les plugins MassGameplay, MassAI, MassCrowd et la page Mass Avoidance sont explicitement « Experimental ». Les déclarations d'équipe proviennent d'un compte dont je n'ai pas vérifié le badge Staff.
6. **Déterminisme bit à bit entre machines ou entre plateformes (Mac ARM, Linux et Windows x86_64)** : aucune page lue ne le garantit ni ne l'aborde. La documentation dit seulement que la physique asynchrone « améliore » le déterminisme.
7. **Prérequis macOS et Xcode de la 5.9** : le tableau de la page s'arrête à la ligne 5.8.
8. **Serveur dédié sous Linux ou macOS** : le guide lu ne décrit que Windows.
9. **Date exacte de sortie de la 5.8** : 17 juin 2026 (annonce Staff sur le forum) ou 23 juin 2026 (date de l'article d'Epic).
10. **Texte du CLUF Unreal Engine** : non lu ; les conditions de redevance viennent de la page Licence et de sa FAQ. Les conditions précises du taux de 3,5 % (« susceptible de ») restent à lire dans le contrat.
11. **Limites chiffrées** (nombre d'agents, de Skeletal Mesh ou d'entités Mass tenables sur Apple Silicon) : aucune donnée officielle trouvée.
12. **Statut de Nanite pour les Skeletal Mesh** : la page Nanite n'indique aucun statut pour cette fonction.
13. **Exécution des tests d'automatisation sous `-nullrhi`** : la combinaison n'est pas illustrée dans les pages lues ; un drapeau « NonNullRHI » n'est apparu que dans un résultat de recherche, page non ouverte.
